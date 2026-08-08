#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    arrayParam,
    corsHeaders,
    gmRequestFetchBody,
    mockAnkiConnectResponse,
    mockJpdbParseFromVocabulary,
    resolveAnkiAction,
} from '../lib/smoke-harness.mjs';
import { createYomuPaths } from '../lib/paths.mjs';
import { cdpMetrics, metricDelta } from '../lib/cdp-performance-metrics.mjs';
import { installYoutubePerformanceStressTargetSelector } from '../lib/youtube-performance-stress-target.mjs';
import { youtubePlayerResponse, youtubeTimedText, youtubeWatchHtml } from '../fixtures/youtube-fixtures.mjs';

const { qaArtifactsRoot } = createYomuPaths(import.meta.dirname);
const artifactLabel = process.env.YOMU_PROFILE_LABEL ?? 'working';
const artifactDir = resolve(process.env.YOMU_PROFILE_ARTIFACT_DIR ?? '.');
const userscriptPath = resolve(process.env.YOMU_PROFILE_USERSCRIPT ?? join(artifactDir, 'dist/yomu.user.js'));
const cssPath = resolve(process.env.YOMU_PROFILE_CSS ?? join(artifactDir, 'dist/yomu.css'));
const builtCompanionDir = join(artifactDir, 'dist/greasyfork');
const hostedCompanionDir = join(artifactDir, 'docs/public/greasyfork');
const defaultCompanionDir = existsSync(join(builtCompanionDir, 'yomu-runtime.user.js'))
    ? builtCompanionDir
    : hostedCompanionDir;
const companionDir = resolve(process.env.YOMU_PROFILE_COMPANION_DIR ?? defaultCompanionDir);
// yomu-ocr-manga carries the OCR controller + raster detectors; without it the
// profile never executes the code whose heat it is meant to measure.
// Tampermonkey loads the runtime through @require before the core userscript.
// Playwright addInitScript does not interpret metadata, so include that exact
// full companion explicitly; without it the profile silently exercises core's
// degraded parser stubs and records zero JPDB/Jiten traffic.
const companionPaths = ['yomu-runtime.user.js']
    .map(name => join(companionDir, name))
    .filter(existsSync);
const outputRoot = resolve(process.env.YOMU_PROFILE_OUTPUT_DIR ?? join(qaArtifactsRoot, 'youtube-performance', artifactLabel));
const headed = process.env.YOMU_PROFILE_HEADED === '1';
const cpuProfilingEnabled = process.env.YOMU_PROFILE_CPU === '1';
const WATCH_URL = 'https://www.youtube.com/watch?v=profile123';
const MOBILE_WATCH_URL = 'https://m.youtube.com/watch?v=profile123';
const HOVER_STRESS_DURATION_MS = Number(process.env.YOMU_PROFILE_HOVER_STRESS_MS ?? 15_000);
const MOBILE_CPU_THROTTLE_RATE = Number(process.env.YOMU_PROFILE_MOBILE_CPU_THROTTLE ?? 4);
const STRESS_WORD_SELECTOR = [
    'ytd-watch-metadata .jpdb-reader-word',
    'ytm-expandable-video-description-body-renderer .jpdb-reader-word',
    'ytd-comment-view-model .jpdb-reader-word',
    'ytm-comment-renderer .jpdb-reader-word',
    '#secondary .jpdb-reader-word',
    '.jpdb-subtitle-list .jpdb-reader-word',
    '.jpdb-reader-document-annotation-portal .jpdb-reader-word',
    '.jpdb-ocr-line .jpdb-reader-word',
].join(',');
// Baseline-only escape hatch: released/source candidates keep the strict
// no-mirror assertion unless the profiler invocation says it is deliberately
// measuring an already-known bad build. This lets a before/after run retain
// timing evidence without normalizing the layout regression into the gate.
const ALLOW_TEXT_MIRRORS = process.env.YOMU_PROFILE_ALLOW_TEXT_MIRRORS === '1';
const RELEASE_EVIDENCE_ELIGIBLE = !ALLOW_TEXT_MIRRORS;
if (ALLOW_TEXT_MIRRORS && /(?:candidate|release|ship)/iu.test(artifactLabel)) {
    throw new Error('YOMU_PROFILE_ALLOW_TEXT_MIRRORS is baseline-only and cannot produce candidate or release evidence.');
}
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const REQUEST_BRIDGE_NAME = '__yomuYoutubePerfRequest';
const JPDB_PARSE_URL = 'https://jpdb.io/api/v1/parse';
const ANKI_CONNECT_URL = 'http://127.0.0.1:8765';
const YOUTUBE_PROFILE_CAPTION_TRACKS = [
    { languageCode: 'ja', vssId: '.ja', name: 'Japanese' },
    { languageCode: 'en', vssId: '.en', name: 'English' },
];
const YOUTUBE_TIMED_TEXT = {
    en: youtubeTimedText([
        { start: 0, duration: 1800, text: 'Thank you, teacher.' },
        { start: 2200, duration: 1800, text: 'We check Japanese subtitles.' },
        { start: 4500, duration: 1800, text: 'A story about taping pickled plums.' },
        { start: 6800, duration: 1800, text: 'Today we read books too.' },
    ]),
    ja: youtubeTimedText([
        { start: 0, duration: 1800, text: '先生いつもありがとうございました。' },
        { start: 2200, duration: 1800, text: '日本語の字幕を確認します。' },
        { start: 4500, duration: 1800, text: '梅干しをセロハンテープで貼る話。' },
        { start: 6800, duration: 1800, text: '今日も本を読みます。' },
    ]),
};

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
    subtitlePausePanel: true,
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
        // Keep the two release-evidence lanes explicit: the API scenario must
        // execute JPDB /parse, while no-api must exercise public Jiten parse +
        // detail hydration instead of inheriting a saved/default provider.
        parserProvider: scenario.apiKey ? 'jpdb' : 'jiten',
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
const jitenPublicRequests = [];

const browser = await chromium.launch({ headless: !headed });
try {
    const profiles = [];
    for (const scenario of scenarioNames.map(profileScenario)) profiles.push(await runScenario(browser, scenario));
    const report = {
        label: artifactLabel,
        generatedAt: new Date().toISOString(),
        diagnostics: {
            allowTextMirrors: ALLOW_TEXT_MIRRORS,
            releaseEvidenceEligible: RELEASE_EVIDENCE_ELIGIBLE,
            ineligibleReason: RELEASE_EVIDENCE_ELIGIBLE
                ? null
                : 'Known-bad baseline: in-host YouTube comment mirrors were explicitly allowed.',
        },
        artifacts: {
            userscript: profileArtifactDescriptor(userscriptPath),
            css: profileArtifactDescriptor(cssPath),
            companions: companionPaths.map(profileArtifactDescriptor),
        },
        scenarios: profiles,
    };
    const serializedReport = JSON.stringify(report, null, 2);
    const profilePath = join(outputRoot, 'profile.json');
    writeFileSync(profilePath, serializedReport);
    console.log(cpuProfilingEnabled
        ? JSON.stringify(functionProfileConsoleSummary(report, profilePath), null, 2)
        : serializedReport);
} finally {
    await browser.close();
}

function functionProfileConsoleSummary(report, profilePath) {
    return {
        label: report.label,
        profilePath,
        artifacts: report.artifacts,
        scenarios: report.scenarios.map(scenario => ({
            name: scenario.name,
            steps: scenario.steps
                .filter(step => step.functionProfile)
                .map(step => ({
                    name: step.name,
                    sampledMs: step.functionProfile.sampled.sampledMs,
                    topSelfTime: step.functionProfile.sampled.topSelfTime.slice(0, 10),
                    topCallCounts: step.functionProfile.calls.topCallCounts.slice(0, 15),
                })),
        })),
    };
}

function profileArtifactDescriptor(path) {
    const contents = readFileSync(path);
    const text = path.endsWith('.js') ? contents.toString('utf8', 0, Math.min(contents.length, 4096)) : '';
    return {
        path,
        version: text.match(/^\/\/\s*@version\s+([^\s]+)$/mu)?.[1] ?? null,
        bytes: contents.length,
        sha256: createHash('sha256').update(contents).digest('hex'),
    };
}

async function runScenario(browser, scenario) {
    parseRequests.length = 0;
    ankiRequests.length = 0;
    jitenPublicRequests.length = 0;
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
        await configureFunctionProfiling(client);
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
        const beforePlaybackStep = await snapshotStep(page, client, 'beforePlayback', 0, 0);
        validateYoutubeCommentState(beforePlaybackStep.page, scenario, 'initial');
        profile.steps.push(beforePlaybackStep);

        await resetPagePerf(page);
        const playbackStart = await beginStep(client);
        await page.evaluate(() => window.__yomuProfileStartPlayback?.());
        await page.waitForTimeout(2600);
        profile.steps.push(await finishStep(page, client, playbackStart, 'afterPlaybackStart'));

        await resetPagePerf(page);
        const autoPauseStart = await beginStep(client);
        const autoPauseInteraction = await exerciseAutoPausePanel(page);
        const autoPauseStep = await finishStep(page, client, autoPauseStart, 'autoPausePanelOpen');
        autoPauseStep.interaction = autoPauseInteraction;
        profile.steps.push(autoPauseStep);

        await page.evaluate(() => window.__yomuProfileStartPlayback?.());
        await page.waitForTimeout(260);

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

        await resetPagePerf(page);
        const hoverStressStart = await beginStep(client);
        const hoverStressInteraction = await exerciseYoutubeHoverStress(page, {
            durationMs: HOVER_STRESS_DURATION_MS,
            label: 'desktop',
        });
        validateStressInteraction(hoverStressInteraction, scenario, 'desktop');
        const hoverStressStep = await finishStep(page, client, hoverStressStart, 'youtubeHoverStress');
        hoverStressStep.interaction = hoverStressInteraction;
        profile.steps.push(hoverStressStep);

        profile.mobileStress = await runMobileHoverStress(context, scenario, scenarioArtifactsDir);
        validateYoutubeCommentState(profile.mobileStress.page, scenario, 'mobile');
        await waitForYoutubeCommentParse(page, scenario);
        profile.finalState = await readPageState(page);
        validateYoutubeCommentState(profile.finalState, scenario, 'desktop');
        profile.parseRequests = parseRequestSummary(0);
        profile.jitenPublicRequests = jitenPublicRequestSummary(0);
        profile.ankiRequests = ankiRequestSummary(0);
        validateParserTraffic(profile, scenario);
        await page.screenshot({ path: join(scenarioArtifactsDir, 'youtube-performance.png'), fullPage: false }).catch(() => undefined);
        await page.close().catch(() => undefined);
        return profile;
    } finally {
        await context.close().catch(() => undefined);
    }
}

function validateParserTraffic(profile, scenario) {
    if (!RELEASE_EVIDENCE_ELIGIBLE) return;
    if (scenario.apiKey && profile.parseRequests.count <= 0) {
        throw new Error(`${scenario.name}: the JPDB API profile did not execute a parse request`);
    }
    if (!scenario.apiKey
        && (profile.jitenPublicRequests.parseCount <= 0 || profile.jitenPublicRequests.infoCount <= 0)) {
        throw new Error(`${scenario.name}: the public Jiten profile did not execute parse and detail requests`);
    }
}

async function runMobileHoverStress(context, scenario, scenarioArtifactsDir) {
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    await client.send('Performance.enable');
    await configureFunctionProfiling(client);
    if (MOBILE_CPU_THROTTLE_RATE > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: MOBILE_CPU_THROTTLE_RATE }).catch(() => undefined);
    await page.setViewportSize({ width: 390, height: 844 });
    await installRoutes(page, scenario);
    await page.goto(MOBILE_WATCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.jpdb-subtitle-player', { timeout: 12000 });
    await page.waitForTimeout(2200);
    await resetPagePerf(page);
    const started = await beginStep(client);
    const interaction = await exerciseYoutubeHoverStress(page, {
        durationMs: HOVER_STRESS_DURATION_MS,
        label: 'mobile',
        activation: 'touch',
    });
    validateStressInteraction(interaction, scenario, 'mobile');
    await waitForYoutubeCommentParse(page, scenario);
    const step = await finishStep(page, client, started, 'mobileYoutubeHoverStress');
    step.interaction = interaction;
    step.viewport = { width: 390, height: 844, cpuThrottleRate: MOBILE_CPU_THROTTLE_RATE };
    await page.screenshot({ path: join(scenarioArtifactsDir, 'youtube-performance-mobile.png'), fullPage: false }).catch(() => undefined);
    await page.close().catch(() => undefined);
    return step;
}

async function installInstrumentation(context) {
    await context.addInitScript(installYoutubePerformanceStressTargetSelector);
    await context.addInitScript(() => {
        const JapaneseText = /[\u3040-\u30ff\u3400-\u9fff]/u;
        const NativeMutationObserver = window.MutationObserver;
        const perf = {
            initAt: performance.now(),
            domContentLoadedAt: null,
            firstJapaneseTextAt: null,
            firstReaderWordAt: null,
            firstRubyAt: null,
            firstSubtitleRubyAt: null,
            firstPageRubyAt: null,
            firstOcrRubyAt: null,
            firstReaderWordDetail: null,
            firstRubyDetail: null,
            events: [],
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
                if (key === 'resets') continue;
                if (Array.isArray(perf[key])) perf[key] = [];
                else if (/At$|Detail$/.test(key)) perf[key] = null;
                else perf[key] = 0;
            }
            perf.initAt = performance.now();
            perf.resets += 1;
            sampleRubyMilestones();
        };

        window.MutationObserver = class ProfiledMutationObserver extends NativeMutationObserver {
            constructor(callback) {
                super((mutations, observer) => {
                    perf.mutationCallbacks += 1;
                    perf.mutationRecords += mutations.length;
                    for (const mutation of mutations) recordMutation(mutation);
                    sampleRubyMilestones();
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

        const milestoneObserver = new NativeMutationObserver(sampleRubyMilestones);
        const startMilestoneObserver = () => {
            try {
                milestoneObserver.observe(document, { subtree: true, childList: true, characterData: true });
                sampleRubyMilestones();
            } catch {
                // Document may be in an early transient state at document-start.
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                recordMilestone('domContentLoadedAt');
                sampleRubyMilestones();
            }, { once: true });
        } else {
            recordMilestone('domContentLoadedAt');
        }
        startMilestoneObserver();
        requestAnimationFrame(sampleRubyMilestones);

        function recordMutation(mutation) {
            if ([...mutation.addedNodes].some(nodeContainsJapanese)) perf.addedJapaneseMutations += 1;
            perf.addedReaderWords += countReaderWords(mutation.addedNodes);
            perf.removedReaderWords += countReaderWords(mutation.removedNodes);
        }

        function sampleRubyMilestones() {
            if (document.readyState !== 'loading') recordMilestone('domContentLoadedAt');
            const bodyText = document.body?.textContent || '';
            if (JapaneseText.test(bodyText)) recordMilestone('firstJapaneseTextAt', textDetail(bodyText));
            const firstWord = document.querySelector('.jpdb-reader-word');
            if (firstWord) recordMilestone('firstReaderWordAt', elementDetail(firstWord), 'firstReaderWordDetail');
            const firstRuby = document.querySelector('.jpdb-reader-word rt, .jpdb-reader-word .jpdb-reader-furi, .jpdb-reader-word .jpdb-reader-ruby');
            if (firstRuby) recordMilestone('firstRubyAt', elementDetail(firstRuby), 'firstRubyDetail');
            if (document.querySelector('.jpdb-subtitle-player .jpdb-reader-word rt, .jpdb-subtitle-list .jpdb-reader-word rt')) recordMilestone('firstSubtitleRubyAt');
            if (document.querySelector('ytd-watch-metadata .jpdb-reader-word rt, ytd-comment-view-model .jpdb-reader-word rt, #secondary .jpdb-reader-word rt')) recordMilestone('firstPageRubyAt');
            if (document.querySelector('.jpdb-ocr-line .jpdb-reader-word rt, .jpdb-ocr-line .jpdb-ocr-furi')) recordMilestone('firstOcrRubyAt');
        }

        function recordMilestone(key, detail, detailKey) {
            if (perf[key] !== null) return;
            const t = performance.now();
            perf[key] = Math.round(t * 10) / 10;
            if (detailKey) perf[detailKey] = detail ?? null;
            perf.events.push({ name: key, t: perf[key], detail: detail ?? undefined });
        }

        function elementDetail(element) {
            return {
                tag: element.tagName,
                className: element.className || '',
                text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
            };
        }

        function textDetail(text) {
            return { text: text.replace(/\s+/g, ' ').trim().slice(0, 80) };
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
    const target = proxiedTargetUrl(parsed) ?? parsed;
    if (method === 'OPTIONS') return textResponse('', 'text/plain', 204);
    if ((target.hostname === 'www.youtube.com' || target.hostname === 'm.youtube.com') && target.pathname === '/watch') {
        return textResponse(performanceWatchFixture(target.hostname === 'm.youtube.com'), 'text/html; charset=utf-8');
    }
    if (target.hostname === 'www.youtube.com' && target.pathname === '/api/timedtext') {
        return textResponse(timedTextForLanguage(target.searchParams.get('lang') ?? 'ja'), 'text/xml; charset=utf-8');
    }
    if (target.hostname === 'www.youtube.com' && target.pathname === '/youtubei/v1/player') {
        return jsonResponse(youtubePlayerResponse('profile123', { captionTracks: YOUTUBE_PROFILE_CAPTION_TRACKS }));
    }
    if (target.hostname === 'jpdb.io' && target.pathname === '/search') {
        return textResponse(jpdbPublicSearchHtml(target.searchParams.get('q') ?? ''), 'text/html; charset=utf-8');
    }
    if (target.hostname === 'api.jiten.moe') return jitenPublicResponse(target);
    if (isAnkiConnectUrl(parsed)) return ankiConnectResponse(rawBody, scenario);
    if (target.href.startsWith(JPDB_PARSE_URL)) return jpdbParseResponse(rawBody);
    return textResponse('', 'text/plain', 204);
}

function responseForRequest(url, rawBody, scenario) {
    const parsed = new URL(url);
    const target = proxiedTargetUrl(parsed) ?? parsed;
    if (target.href.startsWith(JPDB_PARSE_URL)) return jpdbParseResponse(rawBody);
    if (isAnkiConnectUrl(parsed)) return ankiConnectResponse(rawBody, scenario);
    if (target.hostname === 'www.youtube.com' && target.pathname === '/api/timedtext') {
        return textResponse(timedTextForLanguage(target.searchParams.get('lang') ?? 'ja'), 'text/xml; charset=utf-8');
    }
    if (target.hostname === 'jpdb.io' && target.pathname === '/search') {
        return textResponse(jpdbPublicSearchHtml(target.searchParams.get('q') ?? ''), 'text/html; charset=utf-8');
    }
    if (target.hostname === 'api.jiten.moe') return jitenPublicResponse(target);
    return textResponse('', 'text/plain', 204);
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

function jitenPublicResponse(url) {
    if (url.pathname === '/api/vocabulary/parse') {
        const text = url.searchParams.get('text') ?? '';
        const started = performance.now();
        const words = jitenPublicParse(text);
        jitenPublicRequests.push({
            kind: 'parse',
            chars: text.length,
            words: words.length,
            durationMs: Math.round((performance.now() - started) * 10) / 10,
        });
        return jsonResponse(words);
    }
    const match = url.pathname.match(/^\/api\/vocabulary\/(\d+)\/(\d+)\/info$/u);
    if (match) {
        jitenPublicRequests.push({ kind: 'info', wordId: Number(match[1]), readingIndex: Number(match[2]), chars: 0, words: 1, durationMs: 0 });
        return jsonResponse(jitenPublicInfo(Number(match[1]), Number(match[2])));
    }
    return jsonResponse({}, 404);
}

function jitenPublicParse(text) {
    return vocabulary
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => text.includes(row[1]) || text.includes(row[0]))
        .map(({ row, index }) => ({
            wordId: 910000 + index,
            originalText: row[1],
            readingIndex: 0,
            conjugations: [],
        }));
}

function jitenPublicInfo(wordId, readingIndex) {
    const entry = vocabulary[wordId - 910000];
    if (!entry) return {};
    const [, spelling, reading, meaning, partOfSpeech, rank, , pitchAccent] = entry;
    return {
        wordId,
        mainReading: {
            text: spelling === reading ? spelling : `${spelling}[${reading}]`,
            readingIndex,
            frequencyRank: rank,
            usedInMediaAmount: 1,
        },
        alternativeReadings: [],
        partsOfSpeech: partOfSpeech,
        definitions: [{ index: 1, meanings: [meaning], partsOfSpeech: partOfSpeech }],
        pitchAccents: [pitchPositionFromPattern(pitchAccent[0] ?? '')],
        knownStates: [],
        composedOf: [],
        usedIn: [],
        usedInTotal: 0,
    };
}

function pitchPositionFromPattern(pattern) {
    const drop = Array.from(pattern).findIndex((level, index, levels) => level === 'H' && levels[index + 1] === 'L');
    return drop >= 0 ? drop + 1 : 0;
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

async function beginStep(client) {
    if (cpuProfilingEnabled) {
        await client.send('Profiler.startPreciseCoverage', {
            callCount: true,
            detailed: true,
            allowTriggeredUpdates: false,
        });
        await client.send('Profiler.start');
    }
    return {
        cdp: await cdpMetrics(client),
        parseIndex: parseRequests.length,
        ankiIndex: ankiRequests.length,
        functionProfiling: cpuProfilingEnabled,
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
    const functionProfile = started.functionProfiling
        ? await finishFunctionProfile(client)
        : null;
    const cdp = await cdpMetrics(client);
    return {
        name,
        cdpDelta: metricDelta(started.cdp, cdp),
        functionProfile,
        page: await readPageState(page),
        parseRequests: parseRequestSummary(started.parseIndex),
        ankiRequests: ankiRequestSummary(started.ankiIndex),
    };
}

async function configureFunctionProfiling(client) {
    if (!cpuProfilingEnabled) return;
    await client.send('Profiler.enable');
    await client.send('Profiler.setSamplingInterval', { interval: 250 });
}

async function finishFunctionProfile(client) {
    const coverage = await client.send('Profiler.takePreciseCoverage');
    await client.send('Profiler.stopPreciseCoverage');
    const { profile } = await client.send('Profiler.stop');
    return {
        sampled: summarizeCpuProfile(profile),
        calls: summarizePreciseCoverage(coverage.result),
    };
}

function sampledSelfTimeByNode(profile) {
    return (profile.samples ?? []).reduce((selfTimeByNode, nodeId, index) => {
        const deltaUs = profile.timeDeltas?.[index] ?? 0;
        selfTimeByNode.set(nodeId, (selfTimeByNode.get(nodeId) ?? 0) + deltaUs);
        return selfTimeByNode;
    }, new Map());
}

function cpuFrameEntry(node, selfUs) {
    const { callFrame: frame, hitCount = 0 } = node;
    const { functionName = '', url = '', lineNumber = -1, columnNumber = -1 } = frame;
    return {
        functionName: functionName || '(anonymous)',
        url,
        line: lineNumber + 1,
        column: columnNumber + 1,
        selfUs,
        samples: hitCount,
    };
}

function mergeCpuFrame(selfTimeByFrame, entry) {
    const key = `${entry.url}\n${entry.line}:${entry.column}\n${entry.functionName}`;
    const current = selfTimeByFrame.get(key);
    if (!current) {
        selfTimeByFrame.set(key, entry);
        return;
    }
    current.selfUs += entry.selfUs;
    current.samples += entry.samples;
}

function summarizedCpuFrames(profile) {
    const nodesById = new Map(profile.nodes.map(node => [node.id, node]));
    const selfTimeByFrame = new Map();
    for (const [nodeId, selfUs] of sampledSelfTimeByNode(profile)) {
        mergeCpuFrame(selfTimeByFrame, cpuFrameEntry(nodesById.get(nodeId), selfUs));
    }
    return [...selfTimeByFrame.values()]
        .map(({ selfUs, ...entry }) => ({ ...entry, selfMs: Math.round(selfUs / 100) / 10 }))
        .filter(entry => entry.selfMs > 0)
        .sort((left, right) => right.selfMs - left.selfMs)
        .slice(0, 40);
}

function summarizeCpuProfile(profile) {
    return {
        sampleCount: profile.samples?.length ?? 0,
        sampledMs: Math.round((profile.timeDeltas ?? []).reduce((sum, value) => sum + value, 0) / 100) / 10,
        topSelfTime: summarizedCpuFrames(profile),
    };
}

function preciseCoverageCall(script, fn) {
    const range = fn.ranges[0];
    if (!range || range.count <= 0) return null;
    return {
        functionName: fn.functionName,
        url: script.url,
        startOffset: range.startOffset,
        callCount: range.count,
    };
}

function summarizePreciseCoverage(scripts) {
    const calls = scripts.flatMap(script => script.functions
        .map(fn => preciseCoverageCall(script, fn))
        .filter(Boolean));
    calls.sort((left, right) => right.callCount - left.callCount);
    return {
        functionsCalled: calls.length,
        topCallCounts: calls.slice(0, 80),
    };
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

function jitenPublicRequestSummary(startIndex) {
    const slice = jitenPublicRequests.slice(startIndex);
    return {
        count: slice.length,
        parseCount: slice.filter(item => item.kind === 'parse').length,
        infoCount: slice.filter(item => item.kind === 'info').length,
        chars: slice.reduce((sum, item) => sum + item.chars, 0),
        words: slice.reduce((sum, item) => sum + item.words, 0),
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
    // YouTube may auto-hide the rail between profile steps. The control is
    // still mounted and its programmatic activation is the behavior under
    // measurement, so requiring a painted button here makes the profile fail
    // nondeterministically before it can collect the side-panel sample.
    await page.waitForSelector('.jpdb-subtitle-rail [data-action="panel"]', {
        state: 'attached',
        timeout: 12000,
    });
    await page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        if (!panel || panel.hidden) document.querySelector('.jpdb-subtitle-rail [data-action="panel"]')?.click();
    });
    await page.waitForFunction(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        return Boolean(panel && !panel.hidden);
    }, null, { timeout: 12000 });
}

async function exerciseAutoPausePanel(page) {
    await page.evaluate(() => window.__yomuProfileStartPlayback?.());
    await page.waitForTimeout(260);
    return await page.evaluate(async () => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        const player = document.querySelector('#movie_player');
        const video = document.querySelector('video');
        const before = {
            panelOpen: Boolean(panel && !panel.hidden),
            playerWidth: player?.getBoundingClientRect().width ?? 0,
            videoWidth: video?.getBoundingClientRect().width ?? 0,
        };
        const started = performance.now();
        window.__yomuProfileStopPlayback?.();
        const sameTask = {
            visible: Boolean(panel && !panel.hidden),
            rows: panel?.querySelectorAll('.jpdb-subtitle-list-row').length ?? 0,
            entering: panel?.classList.contains('jpdb-subtitle-panel-entering') ?? false,
            playerWidth: player?.getBoundingClientRect().width ?? 0,
            videoWidth: video?.getBoundingClientRect().width ?? 0,
        };
        while (performance.now() - started < 500 && (!panel || panel.hidden)) {
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
        const visibleAt = performance.now();
        const firstPaint = {
            visible: Boolean(panel && !panel.hidden),
            rows: panel?.querySelectorAll('.jpdb-subtitle-list-row').length ?? 0,
            entering: panel?.classList.contains('jpdb-subtitle-panel-entering') ?? false,
            playerWidth: player?.getBoundingClientRect().width ?? 0,
            videoWidth: video?.getBoundingClientRect().width ?? 0,
        };
        await new Promise(resolve => setTimeout(resolve, 60));
        const afterDeferred = {
            visible: Boolean(panel && !panel.hidden),
            rows: panel?.querySelectorAll('.jpdb-subtitle-list-row').length ?? 0,
            entering: panel?.classList.contains('jpdb-subtitle-panel-entering') ?? false,
            playerWidth: player?.getBoundingClientRect().width ?? 0,
            videoWidth: video?.getBoundingClientRect().width ?? 0,
        };
        return {
            before,
            sameTask,
            firstPaint,
            afterDeferred,
            visibleMs: Math.round((visibleAt - started) * 10) / 10,
            totalMs: Math.round((performance.now() - started) * 10) / 10,
        };
    });
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
        const player = document.querySelector('#movie_player');
        const video = document.querySelector('video');
        return {
            panel: panel ? panel.getBoundingClientRect().width : 0,
            player: player ? player.getBoundingClientRect().width : 0,
            video: video ? video.getBoundingClientRect().width : 0,
        };
    });
    const during = [];
    const startedAt = Date.now();
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let index = 1; index <= 8; index += 1) {
        await page.mouse.move(startX - index * 16, startY, { steps: 1 });
        if (index === 4 || index === 8) {
            during.push(await page.evaluate(() => {
                const panel = document.querySelector('.jpdb-subtitle-list');
                const player = document.querySelector('#movie_player');
                const video = document.querySelector('video');
                return {
                    panel: panel ? panel.getBoundingClientRect().width : 0,
                    player: player ? player.getBoundingClientRect().width : 0,
                    video: video ? video.getBoundingClientRect().width : 0,
                };
            }));
        }
    }
    await page.mouse.up();
    await page.waitForTimeout(180);
    const after = await page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        const player = document.querySelector('#movie_player');
        const video = document.querySelector('video');
        return {
            panel: panel ? panel.getBoundingClientRect().width : 0,
            player: player ? player.getBoundingClientRect().width : 0,
            video: video ? video.getBoundingClientRect().width : 0,
        };
    });
    return {
        resized: Math.abs(after.panel - before.panel) > 4,
        beforeWidth: Math.round(before.panel),
        afterWidth: Math.round(after.panel),
        beforePlayerWidth: Math.round(before.player),
        afterPlayerWidth: Math.round(after.player),
        beforeVideoWidth: Math.round(before.video),
        afterVideoWidth: Math.round(after.video),
        during: during.map(sample => ({
            panel: Math.round(sample.panel),
            player: Math.round(sample.player),
            video: Math.round(sample.video),
        })),
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
    // Fast OCR builds can paint their text layer in the same turn as fixture
    // installation. Once present, that intended overlay intercepts the source
    // image; do not spend the profile timeout trying to hover through it.
    const paintedWithoutHover = await page.waitForSelector('.jpdb-ocr-line .jpdb-reader-word', {
        timeout: 1200,
    }).then(() => true, () => false);
    if (!paintedWithoutHover) await page.evaluate(() => {
        const image = document.querySelector('#profile-ocr-image');
        if (!(image instanceof HTMLElement)) return;
        for (const type of ['pointerover', 'mouseover', 'pointerenter', 'mouseenter']) {
            image.dispatchEvent(new MouseEvent(type, { bubbles: true }));
        }
    });
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
                pitchWords: words.filter(word => /jpdb-pitch-(heiban|atamadaka|nakadaka|odaka)/u.test(word.className)).length,
                coloredWords: words.filter(word => /jpdb-(known|new|not-in-deck|learning|due|failed)|anki-/u.test(word.className)).length,
                text: line?.textContent?.replace(/\s+/g, '') ?? '',
            };
        }),
    };
}

async function exerciseYoutubeHoverStress(page, options = {}) {
    const durationMs = Number(options.durationMs ?? HOVER_STRESS_DURATION_MS);
    const label = options.label ?? 'desktop';
    const activation = options.activation ?? 'hover';
    await ensureSubtitlePanelOpen(page).catch(() => undefined);
    await page.evaluate(() => {
        window.__yomuProfileExpandDescription?.();
        window.__yomuProfileStartPlayback?.();
        window.__yomuProfileStartHostRehydrate?.({ intervalMs: 150 });
    });
    await page.waitForFunction(() => document.querySelectorAll('ytd-watch-metadata .jpdb-reader-word, ytd-comment-view-model .jpdb-reader-word, ytm-comment-renderer .jpdb-reader-word, ytm-expandable-video-description-body-renderer .jpdb-reader-word, #secondary .jpdb-reader-word').length > 6, null, { timeout: 16000 }).catch(() => undefined);

    const samples = [];
    const startedAt = Date.now();
    let iteration = 0;
    let paused = false;
    while (Date.now() - startedAt < durationMs) {
        const elapsed = Date.now() - startedAt;
        if (!paused && elapsed > durationMs * 0.38) {
            paused = true;
            await page.evaluate(() => window.__yomuProfileStopPlayback?.());
        } else if (paused && elapsed > durationMs * 0.68) {
            paused = false;
            await page.evaluate(() => window.__yomuProfileStartPlayback?.());
        }
        await page.evaluate(index => {
            const comments = document.querySelector('#comments, ytm-comment-section-renderer');
            const top = comments ? comments.getBoundingClientRect().top + window.scrollY - 120 : 0;
            window.scrollTo({ top: Math.max(0, top + (index % 5) * 180), behavior: 'instant' });
        }, iteration);
        // User input can only target a painted frame. Let scroll projection and
        // fixed overlay geometry settle, then require the resolver below to
        // prove that the chosen word actually owns its point.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
        samples.push(await hoverStressSample(page, iteration, label, activation));
        iteration += 1;
        await page.waitForTimeout(90);
    }
    await page.evaluate(() => window.__yomuProfileStopHostRehydrate?.());
    if (activation === 'hover') await page.mouse.move(8, 8).catch(() => undefined);
    return {
        label,
        durationMs: Date.now() - startedAt,
        samples,
        summary: hoverStressSummary(samples),
    };
}

async function waitForYoutubeCommentParse(page, scenario) {
    await page.waitForFunction(requireRuby => {
        const words = [...document.querySelectorAll([
            'ytd-comment-view-model #content-text .jpdb-reader-word',
            'ytm-comment-renderer #content-text .jpdb-reader-word',
            '.jpdb-reader-document-annotation-portal[data-yomu-document-portal="volatile-prose"] .jpdb-reader-word',
        ].join(','))];
        if (!words.length) return false;
        return !requireRuby || words.some(word => word.querySelector('rt,.jpdb-reader-detached-furi'));
    }, Boolean(scenario.apiKey), { timeout: 20_000 }).catch(() => undefined);
}

async function hoverStressSample(page, index, label, activation = 'hover') {
    await closeStressPopover(page);
    if (activation === 'touch') return await touchStressSample(page, index, label);
    const target = await page.evaluate(({ sampleIndex, selector }) => (
        window.__yomuProfileSelectStressTarget?.(selector, sampleIndex) ?? null
    ), { sampleIndex: index, selector: STRESS_WORD_SELECTOR });
    if (!target) return { label, skipped: true, reason: 'no-visible-word' };

    const started = await page.evaluate(expected => {
        window.__yomuProfileHoverProbe = {
            startedAt: performance.now(),
            expected,
            seenAt: null,
            expectedAt: null,
            text: '',
        };
        return window.__yomuProfileHoverProbe.startedAt;
    }, target.expected);
    await page.mouse.move(target.x, target.y);
    const seen = await waitForStressPopover(page, target.expected);
    const probe = await page.evaluate(() => window.__yomuProfileHoverProbe ?? null);
    return {
        label,
        index,
        activation,
        target,
        opened: seen,
        popoverVisible: Boolean(probe?.seenAt),
        ms: probe?.seenAt ? Math.round((probe.seenAt - started) * 10) / 10 : null,
        expectedMs: probe?.expectedAt ? Math.round((probe.expectedAt - started) * 10) / 10 : null,
        popoverText: probe?.text ?? '',
    };
}

async function closeStressPopover(page) {
    const hasPopover = await page.locator('.jpdb-reader-popover').count().then(count => count > 0).catch(() => false);
    if (!hasPopover) return;
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-popover'), null, { timeout: 500 }).catch(() => undefined);
}

async function touchStressSample(page, index, label) {
    const result = await page.evaluate(({ sampleIndex, selector }) => {
        const target = window.__yomuProfileSelectStressTarget?.(selector, sampleIndex) ?? null;
        if (!target) return null;
        const { x, y } = target;
        // Portal paint is pointer-transparent. Dispatch through the element a
        // real touch would hit at that coordinate so this profiles the source
        // geometry bridge rather than an impossible event targeted directly at
        // the out-of-tree annotation word.
        const eventTarget = document.elementFromPoint(x, y);
        if (!(eventTarget instanceof Element)) return null;
        window.__yomuProfileHoverProbe = {
            startedAt: performance.now(),
            expected: target.expected,
            seenAt: null,
            expectedAt: null,
            text: '',
        };
        const base = {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: 817,
            pointerType: 'touch',
            isPrimary: true,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            width: 18,
            height: 18,
            pressure: 0.5,
            button: 0,
        };
        eventTarget.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1 }));
        eventTarget.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, pressure: 0 }));
        return {
            started: window.__yomuProfileHoverProbe.startedAt,
            target: {
                ...target,
                eventTarget: `${eventTarget.tagName.toLowerCase()}${eventTarget.id ? `#${eventTarget.id}` : ''}`,
            },
        };
    }, { sampleIndex: index, selector: STRESS_WORD_SELECTOR });
    if (!result) return { label, skipped: true, reason: 'no-visible-word' };
    const seen = await waitForStressPopover(page, result.target.expected);
    const probe = await page.evaluate(() => window.__yomuProfileHoverProbe ?? null);
    return {
        label,
        index,
        activation: 'touch',
        target: result.target,
        opened: seen,
        popoverVisible: Boolean(probe?.seenAt),
        ms: probe?.seenAt ? Math.round((probe.seenAt - result.started) * 10) / 10 : null,
        expectedMs: probe?.expectedAt ? Math.round((probe.expectedAt - result.started) * 10) / 10 : null,
        popoverText: probe?.text ?? '',
    };
}

/**
 * Measure the interaction deadline in the page clock and on painted frames.
 * Playwright's wait timeout can race a predicate that becomes true in the same
 * congested renderer turn: the predicate records the exact popup, then the
 * driver rejects its already-expired wall timer. A page-owned deadline makes
 * the verdict deterministic without extending the 3.2 s user-visible budget.
 */
async function waitForStressPopover(page, expected, timeoutMs = 3200) {
    return page.evaluate(({ expectedText, deadlineMs }) => new Promise(resolve => {
        let settled = false;
        let timer = 0;
        const finish = value => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            resolve(value);
        };
        const sample = () => {
            if (settled) return;
            const probe = window.__yomuProfileHoverProbe;
            if (!probe) return finish(false);
            const now = performance.now();
            const popover = document.querySelector('.jpdb-reader-popover');
            const text = popover?.textContent?.replace(/\s+/gu, '') ?? '';
            const hasExpectedText = expectedText ? text.includes(expectedText) : Boolean(text);
            if (popover && probe.seenAt === null) {
                probe.seenAt = now;
                probe.text = text.slice(0, 120);
            }
            if (popover && hasExpectedText && probe.expectedAt === null) {
                probe.expectedAt = now;
                probe.text = text.slice(0, 120);
            }
            const observedAt = expectedText ? probe.expectedAt : probe.seenAt;
            if (observedAt !== null) return finish(observedAt - probe.startedAt <= deadlineMs);
            if (now - probe.startedAt >= deadlineMs) return finish(false);
            requestAnimationFrame(sample);
        };
        timer = window.setTimeout(sample, deadlineMs);
        requestAnimationFrame(sample);
    }), { expectedText: expected, deadlineMs: timeoutMs }).catch(() => false);
}

function hoverStressSummary(samples) {
    const opened = samples.filter(sample => sample.opened && typeof sample.expectedMs === 'number')
        .map(sample => sample.expectedMs)
        .sort((a, b) => a - b);
    return {
        count: samples.length,
        opened: opened.length,
        timedOut: samples.filter(sample => sample.opened === false).length,
        visibleWrongPopover: samples.filter(sample => sample.opened === false && sample.popoverVisible).length,
        p50Ms: percentile(opened, 0.5),
        p95Ms: percentile(opened, 0.95),
        maxMs: opened.at(-1) ?? null,
        over250Ms: opened.filter(ms => ms > 250).length,
        over1000Ms: opened.filter(ms => ms > 1000).length,
    };
}

function validateStressInteraction(interaction, scenario, label) {
    const summary = interaction?.summary;
    if (!summary || summary.count <= 0) {
        throw new Error(`${scenario.name} ${label}: no lookup interaction samples were collected`);
    }
    if (summary.opened <= 0 && RELEASE_EVIDENCE_ELIGIBLE) {
        const diagnosticSamples = interaction.samples?.slice(-3) ?? [];
        throw new Error(`${scenario.name} ${label}: no lookup popup opened during the stress profile; samples=${JSON.stringify(diagnosticSamples)}`);
    }
}

function percentile(values, percentileValue) {
    if (!values.length) return null;
    const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentileValue) - 1));
    return Math.round(values[index] * 10) / 10;
}

async function readPageState(page) {
    return page.evaluate(() => {
        const normalizeText = value => value.replace(/\s+/gu, ' ').trim();
        const commentHosts = [...document.querySelectorAll(
            'ytd-comment-view-model #content-text, ytm-comment-renderer #content-text',
        )];
        const commentSourceTexts = new Set(commentHosts
            .map(host => normalizeText(host.textContent ?? ''))
            .filter(Boolean));
        const commentPortals = [...document.querySelectorAll(
            '.jpdb-reader-document-annotation-portal[data-yomu-document-portal="volatile-prose"]',
        )].filter(portal => commentSourceTexts.has(normalizeText(portal.dataset.sourceText ?? '')));
        const inlineCommentWords = [...document.querySelectorAll(
            'ytd-comment-view-model #content-text .jpdb-reader-word, ytm-comment-renderer #content-text .jpdb-reader-word',
        )];
        const commentPortalWords = commentPortals.flatMap(portal => [...portal.querySelectorAll('.jpdb-reader-word')]);
        const commentWords = [...inlineCommentWords, ...commentPortalWords];
        const hasReading = word => Boolean(word.querySelector('rt,.jpdb-reader-detached-furi'));
        const subtitleWords = [...document.querySelectorAll('.jpdb-subtitle-player .jpdb-reader-word, .jpdb-subtitle-list .jpdb-reader-word')];
        const pageWords = [
            ...document.querySelectorAll('ytd-watch-metadata .jpdb-reader-word, ytm-expandable-video-description-body-renderer .jpdb-reader-word, ytd-comment-view-model .jpdb-reader-word, ytm-comment-renderer .jpdb-reader-word, #secondary .jpdb-reader-word'),
            ...commentPortalWords,
        ];
        return {
            perf: { ...window.__yomuProfilePerf },
            hostRestores: window.__yomuProfileHostRestores ?? 0,
            readerWords: document.querySelectorAll('.jpdb-reader-word').length,
            descriptionWords: document.querySelectorAll('ytd-watch-metadata #description-inline-expander .jpdb-reader-word, ytm-expandable-video-description-body-renderer.jpdb-reader-word, ytm-expandable-video-description-body-renderer .jpdb-reader-word').length,
            commentWords: commentWords.length,
            commentRubyWords: commentWords.filter(hasReading).length,
            commentTextMirrors: document.querySelectorAll('ytd-comment-view-model #content-text .jpdb-reader-text-mirror, ytm-comment-renderer #content-text .jpdb-reader-text-mirror').length,
            commentPortalMirrors: commentPortals.length,
            commentPortalWords: commentPortalWords.length,
            commentPortalRubyWords: commentPortalWords.filter(hasReading).length,
            sidebarWords: document.querySelectorAll('#secondary .jpdb-reader-word, ytd-compact-video-renderer .jpdb-reader-word').length,
            overlayWords: document.querySelectorAll('.jpdb-subtitle-primary .jpdb-reader-word').length,
            rowWords: document.querySelectorAll('.jpdb-subtitle-row-text .jpdb-reader-word').length,
            rubySubtitleWords: subtitleWords.filter(word => word.querySelector('rt')).length,
            coloredSubtitleWords: subtitleWords.filter(word => /jpdb-(known|new|not-in-deck|pitch-)/u.test(word.className)).length,
            rubyPageWords: pageWords.filter(hasReading).length,
            ankiStateWords: document.querySelectorAll('.jpdb-reader-word[data-anki-state], .jpdb-reader-word[class*="anki-"]').length,
            ocrWords: document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word').length,
            ocrRubyWords: [...document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word')].filter(word => word.querySelector('.jpdb-ocr-furi, rt')).length,
            ocrPitchWords: [...document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word')].filter(word => /jpdb-pitch-(heiban|atamadaka|nakadaka|odaka)/u.test(word.className)).length,
            panelOpen: Boolean(document.querySelector('.jpdb-subtitle-list') && !document.querySelector('.jpdb-subtitle-list')?.hidden),
            panelRows: document.querySelectorAll('.jpdb-subtitle-list-row').length,
            panelEntering: document.querySelector('.jpdb-subtitle-list')?.classList.contains('jpdb-subtitle-panel-entering') ?? false,
            videoTime: document.querySelector('video')?.currentTime ?? 0,
        };
    });
}

function validateYoutubeCommentState(state, scenario, label) {
    if (!state || state.commentWords <= 0) {
        throw new Error(`${scenario.name} ${label}: YouTube comment text was not parsed`);
    }
    if (state.commentTextMirrors !== 0 && !ALLOW_TEXT_MIRRORS) {
        throw new Error(`${scenario.name} ${label}: YouTube comment bodies used text mirrors (${state.commentTextMirrors}), which can trigger false 詳細 overflow`);
    }
    if (scenario.apiKey && state.commentRubyWords <= 0 && RELEASE_EVIDENCE_ELIGIBLE) {
        throw new Error(`${scenario.name} ${label}: YouTube comments did not receive API furigana`);
    }
}

function timedTextForLanguage(language) {
    return YOUTUBE_TIMED_TEXT[language === 'en' ? 'en' : 'ja'];
}

function performanceWatchFixture(mobile) {
    const shortDescription = '復習用のPodcastでは、日本語で説明しています。今日も本を読みます。';
    return youtubeWatchHtml({
        fixture: 'performance',
        mobile,
        playerResponse: youtubePlayerResponse('profile123', { captionTracks: YOUTUBE_PROFILE_CAPTION_TRACKS }),
        shortDescription: escapeHtmlForFixture(shortDescription),
        longDescription: escapeHtmlForFixture(youtubeLongDescriptionText()),
        commentsHtml: youtubeCommentFixtures().map((text, index) => commentHtml(text, index, mobile)).join(''),
        sidebarHtml: Array.from({ length: 18 }, (_, index) => sidebarCard(index)).join(''),
    });
}

function youtubeLongDescriptionText() {
    const sentences = [
        '今回の動画では日本語の字幕を確認しながら、説明欄の長い文章も読む練習をします。',
        '先生は復習のために質問を用意して、配信の後で本を読みます。',
        '東京の春について話しながら、関連動画やコメントも日本語で確認します。',
        '字幕、説明、コメント、関連動画が同時に更新されても、辞書ポップアップはすぐ表示される必要があります。',
        '梅干しをセロハンテープで貼る話は少し変ですが、性能テストには便利な文章です。',
    ];
    return Array.from({ length: 42 }, (_, index) => `${index + 1}. ${sentences[index % sentences.length]}`).join('\n');
}

function youtubeCommentFixtures() {
    const comments = [
        '先生いつも配信ありがとうございました。日本語の字幕が本当に助かります。質問する',
        '今日の説明は分かりやすいです。復習してから本を読みます。',
        '関連動画でも同じ話を確認しました。東京の春が楽しみです。',
        '梅干しを貼る話で笑いました。次の動画も見ます。',
        '日本語のコメントを読む練習になります。ありがとうございます。',
    ];
    return Array.from({ length: 48 }, (_, index) => comments[index % comments.length]);
}

function commentHtml(text, index, mobile) {
    const tag = mobile ? 'ytm-comment-renderer' : 'ytd-comment-view-model';
    return `<${tag}>
            <yt-attributed-string id="content-text" data-profile-volatile-text="${escapeHtmlForFixture(text)}">${escapeHtmlForFixture(text)}</yt-attributed-string>
            <span class="more-button" slot="more-button"><span>続きを読む ${index}</span></span>
          </${tag}>`;
}

function sidebarCard(index) {
    const text = index % 2 === 0
        ? `関連動画の発行ニュース ${index}`
        : `梅干しを貼る話 ${index}`;
    return `<ytd-compact-video-renderer data-profile-volatile-text="${text}">
      <div class="thumb"></div><a id="video-title" href="/watch?v=side-${index}">${text}</a>
    </ytd-compact-video-renderer>`;
}
