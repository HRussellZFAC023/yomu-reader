#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    arrayParam,
    gmRequestFetchBody,
    mockAnkiConnectResponse,
    mockJpdbParseFromVocabulary,
    resolveAnkiAction,
} from './lib/smoke-harness.mjs';
import { createYomuPaths } from './lib/paths.mjs';

const { qaArtifactsRoot } = createYomuPaths(import.meta.dirname);
const artifactLabel = process.env.YOMU_PROFILE_LABEL ?? 'working';
const artifactDir = resolve(process.env.YOMU_PROFILE_ARTIFACT_DIR ?? '.');
const userscriptPath = resolve(process.env.YOMU_PROFILE_USERSCRIPT ?? join(artifactDir, 'dist/yomu.user.js'));
const cssPath = resolve(process.env.YOMU_PROFILE_CSS ?? join(artifactDir, 'dist/yomu.css'));
const companionDir = resolve(process.env.YOMU_PROFILE_COMPANION_DIR ?? join(artifactDir, 'dist/greasyfork'));
const companionPaths = ['yomu-anki.user.js', 'yomu-kanji-study.user.js', 'yomu-settings-surface.user.js', 'yomu-video.user.js']
    .map(name => join(companionDir, name))
    .filter(existsSync);
const outputRoot = resolve(process.env.YOMU_PROFILE_OUTPUT_DIR ?? join(qaArtifactsRoot, 'youtube-performance', artifactLabel));
const headed = process.env.YOMU_PROFILE_HEADED === '1';
const WATCH_URL = 'https://www.youtube.com/watch?v=profile123';
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const REQUEST_BRIDGE_NAME = '__yomuYoutubePerfRequest';
const JPDB_PARSE_URL = 'https://jpdb.io/api/v1/parse';
const ANKI_CONNECT_URL = 'http://127.0.0.1:8765';

for (const path of [userscriptPath, cssPath]) {
    if (!existsSync(path)) throw new Error(`Missing profile artifact: ${path}`);
}

const scenarioNames = profileScenarioNames();
rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const baseSettings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    ankiEnabled: false,
    ankiSectionEnabled: false,
    ankiConnectUrl: ANKI_CONNECT_URL,
    ankiDeck: 'Mining',
    ankiModel: 'よむ Japanese',
    localDictionariesEnabled: false,
    audioEnabled: false,
    jpdbDefinitionsEnabled: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    enableLogging: false,
    showFloatingButton: false,
    furiganaMode: 'all',
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleSecondaryVisible: true,
    subtitleNativeBlurred: true,
    subtitleTranscriptVisible: false,
    subtitleTranscriptAutoScroll: false,
    subtitleTranscriptPlacement: 'right',
    subtitleControlsMode: 'auto',
    subtitleHighlightColorSource: 'jpdb',
    subtitleUnderlineColorSource: 'pitch',
    subtitleTextColorSource: 'jpdb',
    wordTextColorSource: 'jpdb',
    wordUnderlineColorSource: 'pitch',
    wordHighlightColorSource: 'off',
    ocrEnabled: true,
    ocrAutoScanImages: false,
    ocrShowTextOverlay: true,
    ocrProvider: 'local-service',
    ocrMinImageArea: 1,
    ocrMaxImagesPerPage: 5,
    ocrPrefetchMargin: 0,
    ocrVideoPauseFrames: true,
};

const vocabulary = [
    ['先生', '先生', 'せんせい', 'teacher', ['n'], 450, ['known'], ['LHH']],
    ['日本語', '日本語', 'にほんご', 'Japanese language', ['n'], 250, ['known'], ['LHHH']],
    ['字幕', '字幕', 'じまく', 'subtitles', ['n'], 1500, ['known'], ['LHH']],
    ['確認', '確認', 'かくにん', 'confirmation', ['n', 'vs'], 900, ['known'], ['LHHH']],
    ['復習', '復習', 'ふくしゅう', 'review', ['n', 'vs'], 1200, ['known'], ['LHHH']],
    ['説明', '説明', 'せつめい', 'explanation', ['n', 'vs'], 600, ['known'], ['LHHH']],
    ['配信', '配信', 'はいしん', 'stream', ['n', 'vs'], 1700, ['known'], ['LHHH']],
    ['今日', '今日', 'きょう', 'today', ['n'], 100, ['known'], ['LH']],
    ['本', '本', 'ほん', 'book', ['n'], 350, ['known'], ['L']],
    ['読む', '読む', 'よむ', 'read', ['v5m'], 400, ['known'], ['LH']],
    ['読みます', '読む', 'よみます', 'read', ['v5m'], 401, ['known'], ['LH']],
    ['質問', '質問', 'しつもん', 'question', ['n', 'vs'], 1300, ['known'], ['LHHH']],
    ['関連動画', '関連動画', 'かんれんどうが', 'related video', ['n'], 2800, ['not-in-deck'], ['LHHHHH']],
    ['発行', '発行', 'はっこう', 'publication', ['n', 'vs'], 2300, ['not-in-deck'], ['LHHH']],
    ['梅干し', '梅干し', 'うめぼし', 'pickled plum', ['n'], 3600, ['not-in-deck'], ['LHHH']],
    ['貼る', '貼る', 'はる', 'stick', ['v5r'], 1800, ['known'], ['LH']],
    ['話', '話', 'はなし', 'story', ['n'], 800, ['known'], ['LHH']],
    ['東京', '東京', 'とうきょう', 'Tokyo', ['n'], 500, ['known'], ['LHHH']],
    ['春', '春', 'はる', 'spring', ['n'], 1100, ['known'], ['LH']],
    ['質問する', '質問する', 'しつもんする', 'ask', ['vs'], 1301, ['known'], ['LHHHHH']],
    ['今回', '今回', 'こんかい', 'this time', ['n'], 900, ['known'], ['LHHH']],
];

function profileScenarioNames() {
    const raw = process.env.YOMU_PROFILE_SCENARIOS ?? process.env.YOMU_PROFILE_SCENARIO;
    if (!raw || raw === 'matrix') return ['api', 'no-api', 'anki', 'all', 'all-no-api'];
    return raw.split(',').map(name => name.trim()).filter(Boolean);
}

function profileScenario(name) {
    const scenarios = {
        api: { name: 'api', apiKey: true, anki: false, allFeatures: false },
        'no-api': { name: 'no-api', apiKey: false, anki: false, allFeatures: false },
        anki: { name: 'anki', apiKey: true, anki: true, allFeatures: false },
        all: { name: 'all', apiKey: true, anki: true, allFeatures: true },
        'all-no-api': { name: 'all-no-api', apiKey: false, anki: true, allFeatures: true },
    };
    const scenario = scenarios[name];
    if (!scenario) throw new Error(`Unknown YouTube profile scenario: ${name}`);
    return scenario;
}

function scenarioSettings(scenario) {
    return {
        ...baseSettings,
        apiKey: scenario.apiKey ? 'profile-key' : '',
        ankiEnabled: scenario.anki,
        ankiSectionEnabled: scenario.anki,
        wordTextColorSource: scenario.anki ? 'anki' : 'jpdb',
        localDictionariesEnabled: scenario.allFeatures,
        audioEnabled: scenario.allFeatures,
        jpdbDefinitionsEnabled: scenario.allFeatures,
        immersionKitEnabled: scenario.allFeatures,
        studyTranslationEnabled: scenario.allFeatures,
        studyGrammarEnabled: scenario.allFeatures,
    };
}

const PROFILE_ANKI_HANDLERS = {
    version: () => 6,
    deckNames: () => ['Mining'],
    getDeckStats: () => ({ 1: { name: 'Mining', total_in_deck: 1 } }),
    modelNames: () => ['よむ Japanese'],
    modelFieldNames: () => [
        'Expression',
        'Reading',
        'Meaning',
        'Sentence',
        'Url',
        'Frequency',
        'PartOfSpeech',
        'Image',
        'Audio',
        'JPDB',
        'Status',
        'Pitch',
        'DictionaryDefinitions',
        'Kanji',
        'Source',
    ],
    findCards: params => profileAnkiFindCards(String(params.query ?? '')),
    findNotes: params => profileAnkiFindNotes(String(params.query ?? '')),
    notesInfo: params => arrayParam(params.notes).map(noteId => profileAnkiNoteInfo(Number(noteId))),
    cardsInfo: params => arrayParam(params.cards).map(cardId => profileAnkiCardInfo(Number(cardId))),
    areDue: params => arrayParam(params.cards).map(() => true),
    canAddNotes: params => arrayParam(params.notes).map(() => true),
    retrieveMediaFile: () => false,
    createDeck: () => null,
    createModel: () => null,
    updateModelTemplates: () => null,
    updateModelStyling: () => null,
    modelFieldAdd: () => null,
    guiBrowse: () => null,
    addNote: () => 9902,
    updateNoteFields: () => null,
};

const parseRequests = [];
const ankiRequests = [];

const browser = await chromium.launch({ headless: !headed });
try {
    const profiles = [];
    for (const scenario of scenarioNames.map(profileScenario)) profiles.push(await runScenario(browser, scenario));
    console.log(JSON.stringify({
        label: artifactLabel,
        generatedAt: new Date().toISOString(),
        artifacts: { userscriptPath, cssPath, companionPaths },
        scenarios: profiles,
    }, null, 2));
} finally {
    await browser.close();
}

async function runScenario(browser, scenario) {
    parseRequests.length = 0;
    ankiRequests.length = 0;
    const scenarioArtifactsDir = scenarioNames.length > 1 ? join(outputRoot, scenario.name) : outputRoot;
    mkdirSync(scenarioArtifactsDir, { recursive: true });
    const context = await browser.newContext({
        bypassCSP: true,
        locale: 'en-GB',
        viewport: { width: 1600, height: 1000 },
    });
    try {
        const page = await context.newPage();
        const client = await context.newCDPSession(page);
        await client.send('Performance.enable');
        await installInstrumentation(context);
        await installUserscriptContext(context, scenarioSettings(scenario), scenario);
        await installRoutes(page, scenario);

        const profile = {
            name: scenario.name,
            settings: {
                apiKey: Boolean(scenario.apiKey),
                anki: Boolean(scenario.anki),
                allFeatures: Boolean(scenario.allFeatures),
            },
            steps: [],
        };

        await page.goto(WATCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('.jpdb-subtitle-player', { timeout: 12000 });
        await page.waitForTimeout(3200);
        profile.steps.push(await snapshotStep(page, client, 'beforePlayback', 0, 0));

        await resetPagePerf(page);
        const playbackStart = await beginStep(client);
        await page.evaluate(() => window.__yomuProfileStartPlayback?.());
        await page.waitForTimeout(2600);
        profile.steps.push(await finishStep(page, client, playbackStart, 'afterPlaybackStart'));

        await resetPagePerf(page);
        const sidePanelStart = await beginStep(client);
        await ensureSubtitlePanelOpen(page);
        await page.waitForFunction(() => document.querySelectorAll('.jpdb-subtitle-list-row').length > 0, null, { timeout: 12000 });
        await page.evaluate(() => window.__yomuProfileStartHostRehydrate?.({ intervalMs: 180 }));
        await page.waitForTimeout(5200);
        await page.evaluate(() => window.__yomuProfileStopHostRehydrate?.());
        profile.steps.push(await finishStep(page, client, sidePanelStart, 'playingWithSidePanelOpen'));

        await resetPagePerf(page);
        const resizeStart = await beginStep(client);
        const resizeInteraction = await resizeSubtitlePanel(page);
        const resizeStep = await finishStep(page, client, resizeStart, 'sidePanelResize');
        resizeStep.interaction = resizeInteraction;
        profile.steps.push(resizeStep);

        await resetPagePerf(page);
        const blurStart = await beginStep(client);
        const blurInteraction = await exerciseSecondarySubtitleBlur(page);
        const blurStep = await finishStep(page, client, blurStart, 'secondaryBlurHoverAndToggle');
        blurStep.interaction = blurInteraction;
        profile.steps.push(blurStep);

        await resetPagePerf(page);
        const ocrStart = await beginStep(client);
        const ocrInteraction = await exerciseOcrOverlay(page);
        const ocrStep = await finishStep(page, client, ocrStart, 'pausedOcrOverlayHover');
        ocrStep.interaction = ocrInteraction;
        profile.steps.push(ocrStep);

        profile.finalState = await readPageState(page);
        profile.parseRequests = parseRequestSummary(0);
        profile.ankiRequests = ankiRequestSummary(0);
        await page.screenshot({ path: join(scenarioArtifactsDir, 'youtube-performance.png'), fullPage: false }).catch(() => undefined);
        await page.close().catch(() => undefined);
        return profile;
    } finally {
        await context.close().catch(() => undefined);
    }
}

async function installInstrumentation(context) {
    await context.addInitScript(() => {
        const JapaneseText = /[\u3040-\u30ff\u3400-\u9fff]/u;
        const NativeMutationObserver = window.MutationObserver;
        const perf = {
            mutationCallbacks: 0,
            mutationRecords: 0,
            addedJapaneseMutations: 0,
            addedReaderWords: 0,
            removedReaderWords: 0,
            longTaskCount: 0,
            longTaskDuration: 0,
            maxLongTask: 0,
            resets: 0,
        };

        window.__yomuProfilePerf = perf;
        window.__yomuProfileResetPerf = () => {
            for (const key of Object.keys(perf)) {
                if (key !== 'resets') perf[key] = 0;
            }
            perf.resets += 1;
        };

        window.MutationObserver = class ProfiledMutationObserver extends NativeMutationObserver {
            constructor(callback) {
                super((mutations, observer) => {
                    perf.mutationCallbacks += 1;
                    perf.mutationRecords += mutations.length;
                    for (const mutation of mutations) recordMutation(mutation);
                    callback(mutations, observer);
                });
            }
        };

        try {
            const longTaskObserver = new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    perf.longTaskCount += 1;
                    perf.longTaskDuration += entry.duration;
                    perf.maxLongTask = Math.max(perf.maxLongTask, entry.duration);
                }
            });
            longTaskObserver.observe({ entryTypes: ['longtask'] });
        } catch {
            // Longtask is Chromium-only and absent in a few synthetic contexts.
        }

        function recordMutation(mutation) {
            if ([...mutation.addedNodes].some(nodeContainsJapanese)) perf.addedJapaneseMutations += 1;
            perf.addedReaderWords += countReaderWords(mutation.addedNodes);
            perf.removedReaderWords += countReaderWords(mutation.removedNodes);
        }

        function nodeContainsJapanese(node) {
            return JapaneseText.test(node.textContent || '');
        }

        function countReaderWords(nodes) {
            return [...nodes].reduce((total, node) => total + readerWordCount(node), 0);
        }

        function readerWordCount(node) {
            if (!(node instanceof Element)) return 0;
            return (node.matches('.jpdb-reader-word') ? 1 : 0) + node.querySelectorAll('.jpdb-reader-word').length;
        }
    });
}

async function installUserscriptContext(context, settings, scenario) {
    await addGmStorageBridgeInitScript(context, {
        key: SETTINGS_KEY,
        value: settings,
        css: readFileSync(cssPath, 'utf8'),
        requestBridgeName: REQUEST_BRIDGE_NAME,
    });
    await context.exposeFunction(REQUEST_BRIDGE_NAME, request => bridgeRequest(request, scenario));
    for (const companionPath of companionPaths) await context.addInitScript({ path: companionPath });
    await context.addInitScript({ path: userscriptPath });
}

async function bridgeRequest(request, scenario) {
    return responseForRequest(request.url, gmRequestFetchBody(request), scenario);
}

async function installRoutes(page, scenario) {
    await page.route('**/*', route => {
        const request = route.request();
        const response = routeResponse(request.url(), request.postData() ?? '', scenario, request.method());
        return route.fulfill({
            status: response.status,
            headers: response.headers,
            contentType: response.contentType,
            body: response.responseText,
        });
    });
}

function routeResponse(url, rawBody, scenario, method = 'GET') {
    const parsed = new URL(url);
    if (method === 'OPTIONS') return textResponse('', 'text/plain', 204);
    if (parsed.hostname === 'www.youtube.com' && parsed.pathname === '/watch') {
        return textResponse(youtubeWatchHtml(), 'text/html; charset=utf-8');
    }
    if (parsed.hostname === 'www.youtube.com' && parsed.pathname === '/api/timedtext') {
        return textResponse(youtubeTimedText(parsed.searchParams.get('lang') ?? 'ja'), 'text/xml; charset=utf-8');
    }
    if (parsed.hostname === 'www.youtube.com' && parsed.pathname === '/youtubei/v1/player') {
        return jsonResponse(youtubePlayerResponse());
    }
    if (parsed.hostname === 'jpdb.io' && parsed.pathname === '/search') {
        return textResponse(jpdbPublicSearchHtml(parsed.searchParams.get('q') ?? ''), 'text/html; charset=utf-8');
    }
    if (isAnkiConnectUrl(parsed)) return ankiConnectResponse(rawBody, scenario);
    if (parsed.href.startsWith(JPDB_PARSE_URL)) return jpdbParseResponse(rawBody);
    return textResponse('', 'text/plain', 204);
}

function responseForRequest(url, rawBody, scenario) {
    const parsed = new URL(url);
    if (parsed.href.startsWith(JPDB_PARSE_URL)) return jpdbParseResponse(rawBody);
    if (isAnkiConnectUrl(parsed)) return ankiConnectResponse(rawBody, scenario);
    if (parsed.hostname === 'www.youtube.com' && parsed.pathname === '/api/timedtext') {
        return textResponse(youtubeTimedText(parsed.searchParams.get('lang') ?? 'ja'), 'text/xml; charset=utf-8');
    }
    if (parsed.hostname === 'jpdb.io' && parsed.pathname === '/search') {
        return textResponse(jpdbPublicSearchHtml(parsed.searchParams.get('q') ?? ''), 'text/html; charset=utf-8');
    }
    return textResponse('', 'text/plain', 204);
}

function jpdbPublicSearchHtml(query) {
    const normalized = String(query ?? '').trim();
    const exact = vocabulary.find(([, spelling, reading]) => spelling === normalized || reading === normalized);
    const candidates = exact ? [exact] : vocabulary.filter(([, spelling, reading]) => spelling.includes(normalized) || reading.includes(normalized)).slice(0, 4);
    return `<!doctype html><html><head><meta charset="utf-8"></head><body><div class="results search">${candidates.map(jpdbPublicSearchResultHtml).join('')}</div></body></html>`;
}

function jpdbPublicSearchResultHtml(entry, index) {
    const [surface, spelling, reading, meaning, partOfSpeech, rank, , pitchAccent] = entry;
    const vid = 900000 + vocabulary.findIndex(item => item === entry) + index;
    return `<div class="result vocabulary">
      <div class="subsection-headword">
        <div class="primary-spelling"><div class="spelling"><a href="/vocabulary/${vid}/${encodeURIComponent(spelling)}/${encodeURIComponent(reading)}"><ruby>${escapeHtmlForFixture(spelling)}<rt>${escapeHtmlForFixture(reading)}</rt></ruby></a></div></div>
      </div>
      <div class="tags"><div class="tag">Top ${rank}</div></div>
      <div class="subsection-meanings"><div class="part-of-speech">${partOfSpeech.map(pos => `<div>${escapeHtmlForFixture(pos)}</div>`).join('')}</div><div class="description">${escapeHtmlForFixture(meaning)}</div></div>
      <div class="subsection-pitch-accent"><div class="subsection"><div><div>${jpdbPitchRowsHtml(reading, pitchAccent[0] ?? '')}</div></div></div></div>
    </div>`;
}

function jpdbPitchRowsHtml(reading, pattern) {
    const kana = Array.from(reading);
    return kana.map((character, index) => {
        const level = pattern[index] === 'H' ? '--pitch-high' : '--pitch-low';
        return `<div style="${level}: 1">${escapeHtmlForFixture(character)}</div>`;
    }).join('');
}

function escapeHtmlForFixture(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char]));
}

function jpdbParseResponse(rawBody) {
    const body = parseJsonBody(rawBody);
    const started = performance.now();
    const result = mockJpdbParseFromVocabulary(body, vocabulary);
    parseRequests.push({
        at: Date.now(),
        durationMs: Math.round((performance.now() - started) * 10) / 10,
        paragraphs: Array.isArray(body.text) ? body.text.length : 0,
        chars: Array.isArray(body.text) ? body.text.join('').length : 0,
    });
    return jsonResponse(result);
}

function isAnkiConnectUrl(url) {
    return (url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.port === '8765';
}

function ankiConnectResponse(rawBody, scenario) {
    const body = parseJsonBody(rawBody);
    ankiRequests.push({
        at: Date.now(),
        scenario: scenario.name,
        action: String(body.action ?? ''),
        params: summarizeAnkiParams(body.params ?? {}),
    });
    return jsonResponse(mockAnkiConnectResponse(body, resolveProfileAnkiAction, { scenario }));
}

function resolveProfileAnkiAction(action, params, context) {
    return resolveAnkiAction(action, params, PROFILE_ANKI_HANDLERS, context);
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

function profileAnkiFindCards(query) {
    if (query === 'deck:*' || query.includes('is:due')) return [8801];
    return /先生|せんせい|日本語|にほんご|読む|よむ|読みます|よみます/.test(query) ? [8801] : [];
}

function profileAnkiFindNotes(query) {
    return profileAnkiFindCards(query).length ? [9901] : [];
}

function profileAnkiNoteInfo(noteId = 9901) {
    return {
        noteId,
        modelName: 'よむ Japanese',
        tags: ['youtube-profile'],
        fields: {
            Expression: { value: '日本語', order: 0 },
            Reading: { value: 'にほんご', order: 1 },
            Meaning: { value: 'Japanese language', order: 2 },
            Sentence: { value: '日本語の字幕を確認します。', order: 3 },
            DictionaryDefinitions: { value: 'Japanese language', order: 12 },
        },
        cards: [8801],
    };
}

function profileAnkiCardInfo(cardId = 8801) {
    return {
        cardId,
        note: 9901,
        deckName: 'Mining',
        cardName: 'Recognition',
        queue: 2,
        type: 2,
        due: 1,
        reps: 12,
        lapses: 0,
        interval: 15,
        question: '<div>日本語</div>',
        answer: '<div>Japanese language</div>',
    };
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
        bytes: [...Buffer.from(responseText)],
        contentType,
        headers: corsHeaders(),
    };
}

function corsHeaders() {
    return {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
    };
}

async function beginStep(client) {
    return {
        cdp: await cdpMetrics(client),
        parseIndex: parseRequests.length,
        ankiIndex: ankiRequests.length,
    };
}

async function snapshotStep(page, client, name, parseIndex, ankiIndex) {
    return {
        name,
        cdp: await cdpMetrics(client),
        page: await readPageState(page),
        parseRequests: parseRequestSummary(parseIndex),
        ankiRequests: ankiRequestSummary(ankiIndex),
    };
}

async function finishStep(page, client, started, name) {
    const cdp = await cdpMetrics(client);
    return {
        name,
        cdpDelta: metricDelta(started.cdp, cdp),
        page: await readPageState(page),
        parseRequests: parseRequestSummary(started.parseIndex),
        ankiRequests: ankiRequestSummary(started.ankiIndex),
    };
}

async function cdpMetrics(client) {
    const result = await client.send('Performance.getMetrics');
    return Object.fromEntries(result.metrics.map(metric => [metric.name, metric.value]));
}

function metricDelta(before, after) {
    const keys = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount', 'JSHeapUsedSize', 'Nodes'];
    return Object.fromEntries(keys.map(key => [key, roundedMetric((after[key] ?? 0) - (before[key] ?? 0))]));
}

function roundedMetric(value) {
    return Math.round(value * 1000) / 1000;
}

function parseRequestSummary(startIndex) {
    const slice = parseRequests.slice(startIndex);
    return {
        count: slice.length,
        paragraphs: slice.reduce((sum, item) => sum + item.paragraphs, 0),
        chars: slice.reduce((sum, item) => sum + item.chars, 0),
        maxChars: slice.reduce((max, item) => Math.max(max, item.chars), 0),
    };
}

function ankiRequestSummary(startIndex) {
    const slice = ankiRequests.slice(startIndex);
    return {
        count: slice.length,
        actions: [...new Set(slice.map(item => item.action).filter(Boolean))],
        multiCount: slice.filter(item => item.action === 'multi').length,
    };
}

async function resetPagePerf(page) {
    await page.evaluate(() => window.__yomuProfileResetPerf?.());
}

async function ensureSubtitlePanelOpen(page) {
    await page.waitForSelector('.jpdb-subtitle-rail [data-action="panel"]', { timeout: 12000 });
    await page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        if (!panel || panel.hidden) document.querySelector('.jpdb-subtitle-rail [data-action="panel"]')?.click();
    });
    await page.waitForFunction(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        return Boolean(panel && !panel.hidden);
    }, null, { timeout: 12000 });
}

async function resizeSubtitlePanel(page) {
    await ensureSubtitlePanelOpen(page);
    const handle = page.locator('.jpdb-subtitle-resize').first();
    await handle.waitFor({ timeout: 12000 });
    const box = await handle.boundingBox();
    if (!box) return { resized: false };
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    const before = await page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        return panel ? panel.getBoundingClientRect().width : 0;
    });
    const startedAt = Date.now();
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let index = 1; index <= 8; index += 1) {
        await page.mouse.move(startX - index * 16, startY, { steps: 1 });
    }
    await page.mouse.up();
    await page.waitForTimeout(180);
    const after = await page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        return panel ? panel.getBoundingClientRect().width : 0;
    });
    return {
        resized: Math.abs(after - before) > 4,
        beforeWidth: Math.round(before),
        afterWidth: Math.round(after),
        durationMs: Date.now() - startedAt,
    };
}

async function exerciseSecondarySubtitleBlur(page) {
    const button = page.locator('.jpdb-subtitle-secondary').first();
    await button.waitFor({ timeout: 12000 });
    const hoverStarted = Date.now();
    await button.hover();
    await page.waitForTimeout(16);
    const hover = await page.evaluate(() => {
        const target = document.querySelector('.jpdb-subtitle-secondary');
        if (!(target instanceof HTMLElement)) return { found: false };
        const after = getComputedStyle(target);
        return {
            found: true,
            filter: after.filter,
            afterColor: after.color,
            afterTextShadow: after.textShadow,
        };
    });
    hover.durationMs = Date.now() - hoverStarted;
    const toggle = await page.evaluate(async () => {
        const target = document.querySelector('.jpdb-subtitle-secondary');
        if (!(target instanceof HTMLElement)) return { found: false };
        const beforeNode = target;
        const beforeBlurred = target.classList.contains('jpdb-subtitle-secondary-blurred');
        const started = performance.now();
        target.click();
        await new Promise(resolve => requestAnimationFrame(resolve));
        const afterNode = document.querySelector('.jpdb-subtitle-secondary');
        return {
            found: true,
            durationMs: Math.round((performance.now() - started) * 10) / 10,
            sameNode: afterNode === beforeNode,
            beforeBlurred,
            afterBlurred: afterNode?.classList.contains('jpdb-subtitle-secondary-blurred') ?? false,
        };
    });
    await page.waitForTimeout(120);
    return { hover, toggle };
}

async function exerciseOcrOverlay(page) {
    await page.evaluate(() => window.__yomuProfileInstallOcrImage?.());
    await page.locator('#profile-ocr-image').hover();
    await page.waitForSelector('.jpdb-ocr-line .jpdb-reader-word', { timeout: 12000 });
    const started = Date.now();
    await page.locator('.jpdb-ocr-line .jpdb-reader-word').first().hover();
    await page.waitForTimeout(120);
    return {
        durationMs: Date.now() - started,
        state: await page.evaluate(() => {
            const line = document.querySelector('.jpdb-ocr-line');
            const words = [...document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word')];
            return {
                lineVisible: Boolean(line),
                words: words.length,
                rubyWords: words.filter(word => word.querySelector('.jpdb-ocr-furi, rt')).length,
                pitchWords: words.filter(word => /jpdb-pitch-(heiban|atamadaka|nakadaka|odaka|kifuku)/u.test(word.className)).length,
                coloredWords: words.filter(word => /jpdb-(known|new|not-in-deck|learning|due|failed)|anki-/u.test(word.className)).length,
                text: line?.textContent?.replace(/\s+/g, '') ?? '',
            };
        }),
    };
}

async function readPageState(page) {
    return page.evaluate(() => {
        const subtitleWords = [...document.querySelectorAll('.jpdb-subtitle-player .jpdb-reader-word, .jpdb-subtitle-list .jpdb-reader-word')];
        const pageWords = [...document.querySelectorAll('ytd-watch-metadata .jpdb-reader-word, ytd-comment-view-model .jpdb-reader-word, #secondary .jpdb-reader-word')];
        return {
            perf: { ...window.__yomuProfilePerf },
            hostRestores: window.__yomuProfileHostRestores ?? 0,
            readerWords: document.querySelectorAll('.jpdb-reader-word').length,
            descriptionWords: document.querySelectorAll('ytd-watch-metadata #description-inline-expander .jpdb-reader-word').length,
            commentWords: document.querySelectorAll('ytd-comment-view-model #content-text .jpdb-reader-word').length,
            sidebarWords: document.querySelectorAll('#secondary .jpdb-reader-word, ytd-compact-video-renderer .jpdb-reader-word').length,
            overlayWords: document.querySelectorAll('.jpdb-subtitle-primary .jpdb-reader-word').length,
            rowWords: document.querySelectorAll('.jpdb-subtitle-row-text .jpdb-reader-word').length,
            rubySubtitleWords: subtitleWords.filter(word => word.querySelector('rt')).length,
            coloredSubtitleWords: subtitleWords.filter(word => /jpdb-(known|new|not-in-deck|pitch-)/u.test(word.className)).length,
            rubyPageWords: pageWords.filter(word => word.querySelector('rt')).length,
            ankiStateWords: document.querySelectorAll('.jpdb-reader-word[data-anki-state], .jpdb-reader-word[class*="anki-"]').length,
            ocrWords: document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word').length,
            ocrRubyWords: [...document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word')].filter(word => word.querySelector('.jpdb-ocr-furi, rt')).length,
            ocrPitchWords: [...document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word')].filter(word => /jpdb-pitch-(heiban|atamadaka|nakadaka|odaka|kifuku)/u.test(word.className)).length,
            panelOpen: Boolean(document.querySelector('.jpdb-subtitle-list') && !document.querySelector('.jpdb-subtitle-list')?.hidden),
            videoTime: document.querySelector('video')?.currentTime ?? 0,
        };
    });
}

function youtubePlayerResponse() {
    return {
        videoDetails: { videoId: 'profile123' },
        captions: {
            playerCaptionsTracklistRenderer: {
                captionTracks: [{
                    baseUrl: 'https://www.youtube.com/api/timedtext?v=profile123&lang=ja',
                    languageCode: 'ja',
                    vssId: '.ja',
                    name: { simpleText: 'Japanese' },
                }, {
                    baseUrl: 'https://www.youtube.com/api/timedtext?v=profile123&lang=en',
                    languageCode: 'en',
                    vssId: '.en',
                    name: { simpleText: 'English' },
                }],
            },
        },
    };
}

function youtubeTimedText(lang = 'ja') {
    if (lang === 'en') {
        return `<timedtext><body>
<p t="0" d="1800"><s t="0">Thank you, teacher.</s></p>
<p t="2200" d="1800"><s t="0">We check Japanese subtitles.</s></p>
<p t="4500" d="1800"><s t="0">A story about taping pickled plums.</s></p>
<p t="6800" d="1800"><s t="0">Today we read books too.</s></p>
</body></timedtext>`;
    }
    return `<timedtext><body>
<p t="0" d="1800"><s t="0">先生いつもありがとうございました。</s></p>
<p t="2200" d="1800"><s t="0">日本語の字幕を確認します。</s></p>
<p t="4500" d="1800"><s t="0">梅干しをセロハンテープで貼る話。</s></p>
<p t="6800" d="1800"><s t="0">今日も本を読みます。</s></p>
</body></timedtext>`;
}

function youtubeWatchHtml() {
    const playerResponse = youtubePlayerResponse();
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>YouTube Performance Fixture</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; }
    #page { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 24px; padding: 72px 24px 48px; box-sizing: border-box; }
    #movie_player { position: relative; min-height: 480px; aspect-ratio: 16 / 9; background: #000; }
    #movie_player video { display: block; width: 100%; height: 100%; background: #050505; }
    .ytp-caption-window-container { position: absolute; left: 0; right: 0; bottom: 72px; text-align: center; }
    .ytp-caption-segment { padding: 4px 10px; background: rgba(0,0,0,.76); color: white; font-size: 32px; text-shadow: 0 2px 4px black; }
    ytd-watch-metadata { display: block; margin-top: 20px; }
    ytd-watch-metadata h1 { font-size: 24px; margin: 0 0 16px; }
    #description-inline-expander { margin: 16px 0; padding: 14px 16px; border-radius: 10px; background: #272727; line-height: 1.5; }
    ytd-comment-view-model { display: block; margin-top: 18px; padding: 16px 0; border-top: 1px solid #333; }
    #content-text { display: block; line-height: 1.6; }
    #secondary { display: grid; gap: 14px; align-content: start; }
    ytd-compact-video-renderer { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; min-height: 84px; }
    ytd-compact-video-renderer .thumb { border-radius: 8px; background: #333; }
    ytd-compact-video-renderer a { color: #f1f1f1; text-decoration: none; line-height: 1.35; font-weight: 600; }
    #profile-ocr-slot { position: fixed; left: 36px; top: 112px; z-index: 1; }
    #profile-ocr-slot img { width: 560px; height: 118px; object-fit: cover; opacity: .2; }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};
    customElements.define('ytd-watch-flexy', class extends HTMLElement {});
  </script>
</head>
<body>
  <ytd-watch-flexy video-id="profile123">
    <main id="page">
      <section id="primary">
        <div id="player"><div id="player-container-outer"><div id="player-container-inner">
          <div id="movie_player">
            <video controls muted playsinline></video>
            <div class="ytp-caption-window-container"><span class="ytp-caption-segment">先生いつもありがとうございました。</span></div>
          </div>
        </div></div></div>
        <ytd-watch-metadata>
          <h1><yt-formatted-string title="日本語タイトル">日本語タイトル</yt-formatted-string></h1>
          <div id="description-inline-expander" data-profile-volatile-text="復習用のPodcastでは、日本語で説明しています。今日も本を読みます。">
            <yt-attributed-string id="attributed-snippet-text">復習用のPodcastでは、日本語で説明しています。今日も本を読みます。</yt-attributed-string>
          </div>
        </ytd-watch-metadata>
        <section id="comments">
          <ytd-comment-view-model>
            <yt-attributed-string id="content-text" data-profile-volatile-text="先生いつも配信ありがとうございました。質問する">先生いつも配信ありがとうございました。質問する</yt-attributed-string>
            <span class="more-button" slot="more-button"><span>続きを読む</span></span>
          </ytd-comment-view-model>
        </section>
        <yt-live-chat-app>
          <yt-live-chat-text-message-renderer>
            <span id="author-name">先生</span>
            <yt-formatted-string id="message">今日はライブで日本語を聞いています。</yt-formatted-string>
          </yt-live-chat-text-message-renderer>
        </yt-live-chat-app>
      </section>
      <aside id="secondary">
        ${Array.from({ length: 18 }, (_, index) => sidebarCard(index)).join('')}
      </aside>
    </main>
  </ytd-watch-flexy>
  <script>
    const player = document.querySelector('#movie_player');
    const video = document.querySelector('video');
    let currentTime = 0.4;
    let playbackTimer = 0;
    let rehydrateTimer = 0;
    const ocrLines = JSON.stringify([
      { text: 'でも今回はこれまでと日本語を読む', box: { left: 0.02, top: 0.18, width: 0.92, height: 0.58 } },
    ]);
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 12 });
    Object.defineProperty(video, 'paused', { configurable: true, get: () => playbackTimer === 0 });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: value => { currentTime = Number(value) || 0; },
    });
    player.getVideoData = () => ({ video_id: 'profile123' });
    player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
    player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    player.setOption = () => {};
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setSize = (width, height) => {
      player.style.width = width + 'px';
      player.style.height = height + 'px';
    };
    window.__yomuProfileHostRestores = 0;
    window.__yomuProfileStartPlayback = () => {
      if (playbackTimer) return;
      playbackTimer = window.setInterval(() => {
        currentTime = (currentTime + 0.25) % 10;
        video.dispatchEvent(new Event('timeupdate'));
      }, 250);
    };
    window.__yomuProfileStartHostRehydrate = ({ intervalMs = 200 } = {}) => {
      if (rehydrateTimer) return;
      rehydrateTimer = window.setInterval(() => {
        document.querySelectorAll('[data-profile-volatile-text]').forEach(element => {
          if (!element.querySelector('.jpdb-reader-word')) return;
          element.textContent = element.getAttribute('data-profile-volatile-text') || '';
          window.__yomuProfileHostRestores += 1;
        });
      }, intervalMs);
    };
    window.__yomuProfileStopHostRehydrate = () => {
      window.clearInterval(rehydrateTimer);
      rehydrateTimer = 0;
    };
    window.__yomuProfileInstallOcrImage = () => {
      if (document.querySelector('#profile-ocr-image')) return;
      const slot = document.createElement('div');
      slot.id = 'profile-ocr-slot';
      const image = document.createElement('img');
      image.id = 'profile-ocr-image';
      image.alt = '';
      image.dataset.yomuVideoFrame = 'true';
      image.dataset.ocrLines = ocrLines;
      image.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="560" height="118"%3E%3Crect width="560" height="118" fill="%23000"/%3E%3C/svg%3E';
      slot.append(image);
      document.body.append(slot);
    };
  </script>
</body>
</html>`;
}

function sidebarCard(index) {
    const text = index % 2 === 0
        ? `関連動画の発行ニュース ${index}`
        : `梅干しを貼る話 ${index}`;
    return `<ytd-compact-video-renderer data-profile-volatile-text="${text}">
      <div class="thumb"></div><a id="video-title" href="/watch?v=side-${index}">${text}</a>
    </ytd-compact-video-renderer>`;
}
