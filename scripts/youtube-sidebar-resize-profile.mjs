#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, devices } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assertBuiltArtifacts,
    createSmokePaths,
    gmRequestFetchBody,
    launchSmokeBrowser,
    mockJpdbParseFromVocabulary,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { loadLocalEnv } from './lib/qa-env.mjs';
import { installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const usage = `Usage: node scripts/youtube-sidebar-resize-profile.mjs

Profiles Yomu YouTube transcript sidebar drag-resize and viewport orientation changes.

Default mode is deterministic fixture mode. Live YouTube mode is explicit:
  YOMU_YOUTUBE_SIDEBAR_RESIZE_LIVE=1 \\
  YOMU_YOUTUBE_SIDEBAR_RESIZE_URL=https://www.youtube.com/watch?v=... \\
  YOMU_YOUTUBE_SIDEBAR_RESIZE_USER_DATA_DIR=/path/to/chrome-profile \\
  node scripts/youtube-sidebar-resize-profile.mjs

Useful env:
  YOMU_YOUTUBE_SIDEBAR_RESIZE_VIEWPORTS=ipad-pro-landscape,ipad-pro-portrait,mobile-iphone-13,desktop-1440
  YOMU_YOUTUBE_SIDEBAR_RESIZE_PLACEMENTS=right,left,bottom
  YOMU_YOUTUBE_SIDEBAR_RESIZE_OUTPUT_DIR=/tmp/yomu-sidebar-resize
  YOMU_YOUTUBE_SIDEBAR_RESIZE_HEADED=1
  YOMU_YOUTUBE_SIDEBAR_RESIZE_LABEL=working
  YOMU_YOUTUBE_SIDEBAR_RESIZE_LIVE_JPDB=1
  YOMU_YOUTUBE_SIDEBAR_RESIZE_NO_API_KEY=1
  YOMU_YOUTUBE_SIDEBAR_RESIZE_SKIP_ORIENTATION=1
`;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage);
    process.exit(0);
}

const { scriptPath: defaultUserscriptPath, cssPath: defaultCssPath, root, artifacts } = createSmokePaths(import.meta.dirname);
loadLocalEnv(root);
const userscriptPath = resolve(process.env.YOMU_YOUTUBE_SIDEBAR_RESIZE_USERSCRIPT ?? defaultUserscriptPath);
const cssPath = resolve(process.env.YOMU_YOUTUBE_SIDEBAR_RESIZE_CSS ?? defaultCssPath);
const companionDir = resolve(process.env.YOMU_YOUTUBE_SIDEBAR_RESIZE_COMPANION_DIR ?? join(root, 'dist/greasyfork'));
const companionPaths = ['yomu-anki.user.js', 'yomu-kanji-study.user.js', 'yomu-settings-surface.user.js', 'yomu-video.user.js']
    .map(name => join(companionDir, name))
    .filter(existsSync);
const label = process.env.YOMU_YOUTUBE_SIDEBAR_RESIZE_LABEL ?? 'working';
const outputRoot = resolve(process.env.YOMU_YOUTUBE_SIDEBAR_RESIZE_OUTPUT_DIR ?? join(artifacts, 'youtube-sidebar-resize-profile', label));
const headed = process.env.YOMU_YOUTUBE_SIDEBAR_RESIZE_HEADED === '1';
const liveMode = process.env.YOMU_YOUTUBE_SIDEBAR_RESIZE_LIVE === '1';
const keylessMode = process.env.YOMU_YOUTUBE_SIDEBAR_RESIZE_NO_API_KEY === '1';
const keylessVisualSoftFail = process.env.YOMU_YOUTUBE_SIDEBAR_RESIZE_KEYLESS_VISUAL_SOFT === '1';
const skipOrientation = process.env.YOMU_YOUTUBE_SIDEBAR_RESIZE_SKIP_ORIENTATION === '1';
const liveJpdbMode = process.env.YOMU_YOUTUBE_SIDEBAR_RESIZE_LIVE_JPDB === '1' && !keylessMode;
const liveJpdbApiKey = (process.env.YOMU_JPDB_API_KEY || process.env.JPDB_API_KEY || '').trim();
const liveUrl = process.env.YOMU_YOUTUBE_SIDEBAR_RESIZE_URL?.trim() ?? '';
const persistentProfileDir = liveMode
    ? (process.env.YOMU_YOUTUBE_SIDEBAR_RESIZE_USER_DATA_DIR?.trim()
        || process.env.YOMU_HOME_PROFILE_USER_DATA_DIR?.trim()
        || process.env.YOMU_CAPTURE_PROFILE?.trim()
        || '')
    : '';
const explicitPersistentChannel = Boolean(
    process.env.YOMU_YOUTUBE_SIDEBAR_RESIZE_CHANNEL
    || process.env.YOMU_HOME_PROFILE_CHANNEL
    || process.env.YOMU_PLAYWRIGHT_CHANNEL,
);
const persistentChannel = process.env.YOMU_YOUTUBE_SIDEBAR_RESIZE_CHANNEL
    || process.env.YOMU_HOME_PROFILE_CHANNEL
    || process.env.YOMU_PLAYWRIGHT_CHANNEL
    || 'chrome';
const requestBridgeName = '__yomuYoutubeSidebarResizeRequest';
const jpdbParseUrl = 'https://jpdb.io/api/v1/parse';
const fixtureWatchUrl = 'https://www.youtube.com/watch?v=p044fixture';
const fixtureMobileWatchUrl = 'https://m.youtube.com/watch?v=p044fixture';
const vocabulary = [
    ['今日', '今日', 'きょう', 'today', ['n'], 100, ['known'], ['LH']],
    ['日本語', '日本語', 'にほんご', 'Japanese language', ['n'], 250, ['known'], ['LHHH']],
    ['字幕', '字幕', 'じまく', 'subtitles', ['n'], 1500, ['known'], ['LHH']],
    ['確認', '確認', 'かくにん', 'confirmation', ['n', 'vs'], 900, ['known'], ['LHHH']],
    ['左側', '左側', 'ひだりがわ', 'left side', ['n'], 1900, ['known'], ['LHHH']],
    ['動画', '動画', 'どうが', 'video', ['n'], 600, ['known'], ['LHH']],
    ['下側', '下側', 'したがわ', 'bottom side', ['n'], 2100, ['known'], ['LHHH']],
    ['説明', '説明', 'せつめい', 'description', ['n', 'vs'], 700, ['known'], ['LHHH']],
    ['操作', '操作', 'そうさ', 'operation', ['n', 'vs'], 1000, ['known'], ['LHH']],
    ['向き', '向き', 'むき', 'direction', ['n'], 1200, ['known'], ['LH']],
    ['変更', '変更', 'へんこう', 'change', ['n', 'vs'], 800, ['known'], ['LHHH']],
    ['余白', '余白', 'よはく', 'margin', ['n'], 2300, ['known'], ['LHH']],
    ['保ちます', '保つ', 'たもちます', 'maintain', ['v5t'], 2400, ['known'], ['LHHH']],
];

if (liveMode && !liveUrl) {
    throw new Error('Live mode needs YOMU_YOUTUBE_SIDEBAR_RESIZE_URL pointing at a YouTube watch page with usable captions.');
}
if (liveJpdbMode && !liveJpdbApiKey) {
    throw new Error('Live JPDB mode needs YOMU_JPDB_API_KEY or JPDB_API_KEY in the environment.');
}

assertBuiltArtifacts([userscriptPath, cssPath], root);
rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const viewportSpecs = selectViewportSpecs();
const placements = selectPlacements();
const report = {
    generatedAt: new Date().toISOString(),
    mode: liveMode ? 'live' : 'fixture',
    label,
    outputRoot,
    artifacts: { userscriptPath, cssPath, companionPaths },
    live: {
        url: liveMode ? liveUrl : null,
        persistentProfileDir: persistentProfileDir || null,
        channel: persistentProfileDir ? persistentChannel : null,
        jpdb: keylessMode ? 'none' : liveJpdbMode ? 'live' : 'mock',
        keyless: keylessMode,
    },
    matrix: { viewports: viewportSpecs.map(spec => spec.name), placements },
    scenarios: [],
};

let sharedBrowser = null;
try {
    if (!persistentProfileDir) sharedBrowser = await launchSmokeBrowser(chromium, 'chromium', { headless: !headed });
    for (const viewport of viewportSpecs) {
        for (const placement of placements) {
            const scenarioName = `${viewport.name}-${placement}`;
            console.error(`[youtube-sidebar-resize] ${scenarioName}`);
            const scenario = await runScenario({ viewport, placement, sharedBrowser }).catch(error => scenarioFailure(scenarioName, viewport, placement, error));
            report.scenarios.push(scenario);
            writeReport(report);
        }
    }
} finally {
    if (sharedBrowser) await sharedBrowser.close().catch(() => undefined);
}

writeReport(report);
console.log(JSON.stringify(report, null, 2));
if (report.scenarios.some(scenario => !scenario.ok)) process.exitCode = 1;

async function runScenario({ viewport, placement, sharedBrowser }) {
    const scenarioDir = join(outputRoot, `${viewport.name}-${placement}`);
    mkdirSync(scenarioDir, { recursive: true });
    const { context, close } = await openScenarioContext(sharedBrowser, viewport);
    const page = await context.newPage();
    const client = await newPerformanceClient(context, page);
    const errors = [];
    const requestLog = [];
    page.on('pageerror', error => {
        const message = error?.stack ? String(error.stack) : String(error);
        errors.push(redactUrl(message).slice(0, 2000));
    });
    page.on('console', message => {
        if (message.type() === 'error' && /yomu|jpdb|subtitle|resize/i.test(message.text())) errors.push(message.text());
    });
    page.on('requestfailed', request => {
        const failure = request.failure();
        if (failure && /youtube|jpdb|jiten|anki/i.test(request.url())) {
            requestLog.push({ kind: 'failed', url: redactUrl(request.url()), errorText: failure.errorText });
        }
    });

    try {
        await installConsentCookies(context);
        await installPerformanceInstrumentation(page);
        await installApiMocks(page, requestLog);
        if (!liveMode) await installFixtureRoutes(page, requestLog);
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: smokeSettings(placement),
            css: readFileSync(cssPath, 'utf8'),
            requestBridgeName,
        });
        await page.exposeFunction(requestBridgeName, request => bridgeResponse(request, requestLog));
        await context.addInitScript({
            content: [...companionPaths, userscriptPath].map(filePath => readFileSync(filePath, 'utf8')).join('\n;\n'),
        });

        const url = scenarioUrl(viewport);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: liveMode ? 45_000 : 30_000 });
        if (liveMode) await dismissConsent(page);
        await installUserscriptCssResource(page, cssPath);

        await waitForPanelButton(page);
        await screenshot(page, scenarioDir, 'loaded');

        const steps = [];
        const screenshotNames = ['loaded'];
        steps.push(await measuredStep(page, client, 'open-sidebar', async () => {
            await page.locator('.jpdb-subtitle-rail [data-action="panel"]').evaluate(button => button.click());
            await waitForPanelOpen(page);
        }));
        await screenshot(page, scenarioDir, 'open');
        screenshotNames.push('open');
        steps.push(await measuredStep(page, client, 'full-transcript-render', async () => {
            await waitForFullTranscriptRender(page);
        }));

        if (keylessMode) {
            const visualParse = await measuredStep(page, client, 'keyless-visual-parse', async () => {
                await waitForKeylessVisualParse(page);
            });
            visualParse.visualParse = await keylessVisualParseEvidence(page);
            steps.push(visualParse);
            await screenshot(page, scenarioDir, 'keyless-visual-parse');
            screenshotNames.push('keyless-visual-parse');
        }

        const afterOpen = await snapshot(page);
        const drag = await measuredStep(page, client, 'drag-resize', async () => {
            await dragResizeTranscriptPanel(page, afterOpen.placement || placement);
            if (keylessMode) await waitForVisiblePageParse(page);
        });
        drag.drag = await dragEvidence(page, afterOpen);
        steps.push(drag);
        await screenshot(page, scenarioDir, 'dragged');
        screenshotNames.push('dragged');

        let transcriptScrollContinuity;
        const transcriptScroll = await measuredStep(page, client, 'scroll-transcript-list', async () => {
            transcriptScrollContinuity = await scrollTranscriptList(page);
            if (keylessMode) await waitForVisiblePageParse(page);
        });
        transcriptScroll.transcriptScroll = {
            ...await transcriptScrollEvidence(page),
            continuity: transcriptScrollContinuity,
        };
        steps.push(transcriptScroll);
        await screenshot(page, scenarioDir, 'transcript-scrolled');
        screenshotNames.push('transcript-scrolled');

        const beforeScroll = await snapshot(page);
        const scroll = await measuredStep(page, client, 'page-scroll-with-panel-open', async () => {
            await scrollPageWithPanelOpen(page);
            if (keylessMode) await waitForVisiblePageParse(page);
        });
        scroll.scroll = await scrollEvidence(page, beforeScroll);
        steps.push(scroll);
        await screenshot(page, scenarioDir, 'scrolled');
        screenshotNames.push('scrolled');

        if (!skipOrientation) {
            const beforeOrientation = await snapshot(page);
            const orientation = await measuredStep(page, client, 'orientation-change', async () => {
                await page.setViewportSize(viewport.orientationViewport);
                await waitForViewport(page, viewport.orientationViewport);
                await waitForPanelOpen(page);
                await waitForPanelSettledInViewport(page).catch(() => undefined);
                if (keylessMode) {
                    await waitForVisiblePageParse(page);
                    await waitForVisibleTranscriptParse(page);
                }
            });
            orientation.orientation = await orientationEvidence(page, beforeOrientation);
            steps.push(orientation);
            await screenshot(page, scenarioDir, 'orientation');
            screenshotNames.push('orientation');
        }

        const finalSnapshot = await snapshot(page);
        const layoutEvidence = steps.map(step => ({
            step: step.name,
            requestedPlacement: placement,
            effectivePlacement: step.snapshot.placement,
            problems: [
                ...layoutProblems(step.snapshot, placement, step.name),
                ...(keylessMode ? visualParseProblems(step.snapshot, step.name) : []),
            ],
            warnings: layoutWarnings(step.snapshot, step.name),
            layout: compactSnapshot(step.snapshot),
        }));
        const allProblems = layoutEvidence.flatMap(item => item.problems.map(problem => `${item.step}: ${problem}`));
        const scenario = {
            ok: allProblems.length === 0 && errors.length === 0,
            name: `${viewport.name}-${placement}`,
            requestedPlacement: placement,
            initialViewport: viewport.viewport,
            orientationViewport: viewport.orientationViewport,
            finalViewport: finalSnapshot.viewport,
            steps,
            performanceProblems: performanceProblems(steps),
            credentialProblems: credentialProblems(requestLog),
            layoutEvidence,
            requests: summarizeRequests(requestLog),
            errors: errors.slice(0, 12),
            screenshots: screenshotNames.map(name => join(scenarioDir, `${name}.png`)),
        };
        scenario.ok = scenario.ok && scenario.performanceProblems.length === 0 && scenario.credentialProblems.length === 0;
        writeFileSync(join(scenarioDir, 'scenario.json'), `${JSON.stringify(scenario, null, 2)}\n`);
        return scenario;
    } finally {
        await closePerformanceClient(client);
        await page.close().catch(() => undefined);
        await close();
    }
}

function scenarioFailure(name, viewport, placement, error) {
    return {
        ok: false,
        name,
        requestedPlacement: placement,
        initialViewport: viewport.viewport,
        orientationViewport: viewport.orientationViewport,
        error: String(error?.stack || error?.message || error),
    };
}

async function openScenarioContext(sharedBrowser, viewport) {
    const options = {
        ...viewport.contextOptions,
        bypassCSP: true,
        locale: 'ja-JP',
    };
    if (persistentProfileDir) {
        const context = await launchPersistentContextWithFallback(resolve(persistentProfileDir), options);
        for (const page of context.pages()) await page.close().catch(() => undefined);
        return { context, close: () => context.close().catch(() => undefined) };
    }
    const context = await sharedBrowser.newContext(options);
    return { context, close: () => context.close().catch(() => undefined) };
}

async function launchPersistentContextWithFallback(profileDir, options) {
    const channelOptions = { ...options, channel: persistentChannel, headless: !headed };
    try {
        return await chromium.launchPersistentContext(profileDir, channelOptions);
    } catch (error) {
        if (!explicitPersistentChannel && persistentChannel === 'chrome' && isMissingBrowserExecutable(error)) {
            return await chromium.launchPersistentContext(profileDir, { ...options, headless: !headed });
        }
        throw error;
    }
}

function isMissingBrowserExecutable(error) {
    const message = String(error?.message ?? '');
    return message.includes("Executable doesn't exist") || /playwright install/i.test(message);
}

async function newPerformanceClient(context, page) {
    try {
        const client = await context.newCDPSession(page);
        await client.send('Performance.enable');
        return client;
    } catch {
        return null;
    }
}

async function closePerformanceClient(client) {
    if (!client) return;
    await client.detach().catch(() => undefined);
}

async function installPerformanceInstrumentation(page) {
    await page.addInitScript(() => {
        const state = {
            longTasks: [],
            layoutShifts: [],
            resizeEvents: [],
            frameGaps: [],
            maxFrameGapMs: 0,
        };
        Object.defineProperty(window, '__yomuSidebarResizeProfile', { configurable: true, value: state });
        try {
            new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    state.longTasks.push({
                        startTime: entry.startTime,
                        duration: entry.duration,
                        name: entry.name,
                    });
                }
            }).observe({ entryTypes: ['longtask'] });
        } catch {}
        try {
            new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    state.layoutShifts.push({
                        startTime: entry.startTime,
                        value: entry.value,
                        hadRecentInput: entry.hadRecentInput,
                    });
                }
            }).observe({ type: 'layout-shift', buffered: true });
        } catch {}
        window.addEventListener('resize', () => {
            state.resizeEvents.push({ at: performance.now(), width: innerWidth, height: innerHeight });
        }, { passive: true });
        let previousFrame = 0;
        const tick = now => {
            if (previousFrame) {
                const gap = now - previousFrame;
                if (gap > 40) {
                    state.frameGaps.push({ at: now, gap });
                    state.maxFrameGapMs = Math.max(state.maxFrameGapMs, gap);
                }
            }
            previousFrame = now;
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

async function measuredStep(page, client, name, action) {
    const started = await perfAnchor(page, client);
    await action();
    const ended = await perfAnchor(page, client);
    await waitForFrames(page, 3);
    const snapshotAfterStep = await snapshot(page);
    const longTasks = performanceEntriesBetween(ended.profile.longTasks, started.now, ended.now, 'duration');
    const layoutShifts = performanceEntriesBetween(ended.profile.layoutShifts, started.now, ended.now, 'value');
    const frameGaps = (ended.profile.frameGaps ?? []).filter(entry => entry.at >= started.now && entry.at <= ended.now).map(entry => ({
        at: round(entry.at),
        gap: round(entry.gap),
    }));
    return {
        name,
        durationMs: round(ended.now - started.now),
        cdp: diffCdpMetrics(started.cdp, ended.cdp),
        longTasks,
        longTaskTotalMs: roundTotal(longTasks, 'duration'),
        maxLongTaskMs: roundMax(longTasks, 'duration'),
        layoutShifts,
        cumulativeLayoutShift: roundTotal(
            layoutShifts.filter(entry => !entry.hadRecentInput),
            'value',
        ),
        resizeEvents: (ended.profile.resizeEvents ?? []).filter(entry => entry.at >= started.now && entry.at <= ended.now),
        frameGaps,
        maxFrameGapMs: roundMax(frameGaps, 'gap'),
        snapshot: snapshotAfterStep,
    };
}

async function perfAnchor(page, client) {
    const [now, profile, cdp] = await Promise.all([
        page.evaluate(() => performance.now()),
        page.evaluate(() => {
            const profile = window.__yomuSidebarResizeProfile ?? {};
            return {
                longTasks: [...(profile.longTasks ?? [])],
                layoutShifts: [...(profile.layoutShifts ?? [])],
                resizeEvents: [...(profile.resizeEvents ?? [])],
                frameGaps: [...(profile.frameGaps ?? [])],
                maxFrameGapMs: profile.maxFrameGapMs ?? 0,
            };
        }),
        readCdpMetrics(client),
    ]);
    return { now, profile, cdp };
}

async function readCdpMetrics(client) {
    if (!client) return null;
    try {
        const metrics = await client.send('Performance.getMetrics');
        return Object.fromEntries(metrics.metrics.map(metric => [metric.name, metric.value]));
    } catch {
        return null;
    }
}

function diffCdpMetrics(before, after) {
    if (!before || !after) return null;
    const names = [
        'LayoutCount',
        'RecalcStyleCount',
        'LayoutDuration',
        'RecalcStyleDuration',
        'ScriptDuration',
        'TaskDuration',
        'JSHeapUsedSize',
        'Nodes',
    ];
    return Object.fromEntries(names.map(name => [name, round((after[name] ?? 0) - (before[name] ?? 0))]));
}

function performanceEntriesBetween(entries, start, end, valueKey) {
    return (entries ?? [])
        .filter(entry => entry.startTime >= start && entry.startTime <= end)
        .map(entry => Object.fromEntries(Object.entries(entry).map(([key, value]) => [
            key,
            typeof value === 'number' ? round(value) : value,
        ])))
        .filter(entry => valueKey ? Number(entry[valueKey]) > 0 : true);
}

async function dragResizeTranscriptPanel(page, placement) {
    await waitForPanelInteractive(page).catch(() => undefined);
    const before = await panelSize(page);
    const drag = await dragPlan(page, placement);
    await page.mouse.move(drag.start.x, drag.start.y);
    await page.mouse.down();
    for (const point of drag.moves) await page.mouse.move(point.x, point.y, { steps: 2 });
    await page.mouse.up();
    const resized = await waitForPanelSizeChanged(page, before, 800);
    if (!resized) {
        await resizeTranscriptPanelFromKeyboard(page, placement);
        await waitForPanelSizeChanged(page, before, 800);
    }
}

async function scrollPageWithPanelOpen(page) {
    await page.evaluate(() => {
        const scroller = document.scrollingElement ?? document.documentElement;
        const maxScroll = Math.max(0, scroller.scrollHeight - innerHeight);
        const target = Math.min(maxScroll, Math.max(240, Math.round(innerHeight * 0.55)));
        window.scrollTo({ top: target, behavior: 'instant' });
    });
    await page.waitForFunction(() => {
        const scroller = document.scrollingElement ?? document.documentElement;
        return scroller.scrollTop > 16 || scroller.scrollHeight <= innerHeight + 16;
    }, null, { timeout: 1500 }).catch(() => undefined);
}

async function scrollTranscriptList(page) {
    const before = await page.evaluate(() => {
        const scroller = document.querySelector('.jpdb-subtitle-list-scroll');
        if (!(scroller instanceof HTMLElement)) return null;
        scroller.dataset.scrollContinuityProbe = 'original';
        const rows = [...scroller.querySelectorAll('.jpdb-subtitle-list-row')];
        const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        scroller.scrollTo({ top: Math.round(maxScroll * 0.86), behavior: 'instant' });
        return {
            virtualized: scroller.dataset.virtualized === 'true',
            firstRow: rows[0]?.getAttribute('data-row-index') ?? null,
            lastRow: rows.at(-1)?.getAttribute('data-row-index') ?? null,
        };
    });
    await page.waitForFunction(() => {
        const scroller = document.querySelector('.jpdb-subtitle-list-scroll');
        if (!(scroller instanceof HTMLElement)) return false;
        const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        return maxScroll <= 0 || scroller.scrollTop > maxScroll * 0.5;
    }, null, { timeout: 1500 }).catch(() => undefined);
    await waitForVisibleTranscriptParse(page);
    await waitForFrames(page, 3);
    const after = await page.evaluate(() => {
        const scroller = document.querySelector('.jpdb-subtitle-list-scroll');
        if (!(scroller instanceof HTMLElement)) return null;
        const rows = [...scroller.querySelectorAll('.jpdb-subtitle-list-row')];
        return {
            sameScroller: scroller.dataset.scrollContinuityProbe === 'original',
            scrollTop: Math.round(scroller.scrollTop),
            firstRow: rows[0]?.getAttribute('data-row-index') ?? null,
            lastRow: rows.at(-1)?.getAttribute('data-row-index') ?? null,
        };
    });
    const advancedVirtualRows = !before?.virtualized || Number(after?.firstRow) > Number(before.firstRow);
    if (!before || !after || !after.sameScroller || after.scrollTop <= 0 || !advancedVirtualRows) {
        throw new Error(`Transcript scroll continuity failed: ${JSON.stringify({ before, after, advancedVirtualRows })}`);
    }
    return { before, after, advancedVirtualRows };
}

async function dragPlan(page, placement) {
    return await page.evaluate(panelPlacement => {
        const handle = document.querySelector('[data-resize-transcript]');
        if (!(handle instanceof HTMLElement)) throw new Error('Missing transcript resize handle.');
        const rect = handle.getBoundingClientRect();
        const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const metrics = resizeHandleMetrics(handle);
        const sideDirection = shouldGrowPanel(metrics) ? 1 : -1;
        const delta = panelPlacement === 'bottom'
            ? { x: 0, y: shouldGrowPanel(metrics) ? -160 : 160 }
            : panelPlacement === 'left'
                ? { x: 180 * sideDirection, y: 0 }
                : { x: -180 * sideDirection, y: 0 };
        const moves = Array.from({ length: 8 }, (_, index) => {
            const ratio = (index + 1) / 8;
            return { x: start.x + delta.x * ratio, y: start.y + delta.y * ratio };
        });
        return { start, moves };

        function resizeHandleMetrics(element) {
            const current = Number(element.getAttribute('aria-valuenow') || 0);
            const min = Number(element.getAttribute('aria-valuemin') || 0);
            const max = Number(element.getAttribute('aria-valuemax') || 0);
            return {
                current: Number.isFinite(current) ? current : 0,
                min: Number.isFinite(min) ? min : 0,
                max: Number.isFinite(max) ? max : 0,
            };
        }

        function shouldGrowPanel(metrics) {
            const growRoom = metrics.max - metrics.current;
            const shrinkRoom = metrics.current - metrics.min;
            return growRoom > shrinkRoom;
        }
    }, placement);
}

async function resizeTranscriptPanelFromKeyboard(page, placement) {
    const handle = page.locator('[data-resize-transcript]').first();
    await handle.focus();
    const grow = await handle.evaluate(element => {
        const current = Number(element.getAttribute('aria-valuenow') || 0);
        const min = Number(element.getAttribute('aria-valuemin') || 0);
        const max = Number(element.getAttribute('aria-valuemax') || 0);
        return max - current > current - min;
    });
    const key = placement === 'bottom'
        ? grow ? 'ArrowUp' : 'ArrowDown'
        : placement === 'left'
            ? grow ? 'ArrowRight' : 'ArrowLeft'
            : grow ? 'ArrowLeft' : 'ArrowRight';
    for (let index = 0; index < 4; index += 1) await page.keyboard.press(key);
}

async function dragEvidence(page, beforeOpen) {
    const after = await snapshot(page);
    return {
        before: compactSnapshot(beforeOpen),
        after: compactSnapshot(after),
        delta: {
            width: round((after.panel?.width ?? 0) - (beforeOpen.panel?.width ?? 0)),
            height: round((after.panel?.height ?? 0) - (beforeOpen.panel?.height ?? 0)),
        },
    };
}

async function scrollEvidence(page, beforeScroll) {
    const after = await snapshot(page);
    return {
        before: compactSnapshot(beforeScroll),
        after: compactSnapshot(after),
        delta: {
            scrollY: round((after.scroll?.y ?? 0) - (beforeScroll.scroll?.y ?? 0)),
            panelTop: round((after.panel?.top ?? 0) - (beforeScroll.panel?.top ?? 0)),
            panelBottom: round((after.panel?.bottom ?? 0) - (beforeScroll.panel?.bottom ?? 0)),
        },
        panelStillOpen: !after.panelHidden && Boolean(after.panel),
    };
}

async function transcriptScrollEvidence(page) {
    const after = await snapshot(page);
    return {
        rowCount: after.rowCount,
        transcript: after.transcript,
    };
}

async function orientationEvidence(page, beforeOrientation) {
    const after = await snapshot(page);
    return {
        before: compactSnapshot(beforeOrientation),
        after: compactSnapshot(after),
        delta: {
            viewportWidth: round((after.viewport?.width ?? 0) - (beforeOrientation.viewport?.width ?? 0)),
            viewportHeight: round((after.viewport?.height ?? 0) - (beforeOrientation.viewport?.height ?? 0)),
            visualViewportWidth: round((after.visualViewport?.width ?? 0) - (beforeOrientation.visualViewport?.width ?? 0)),
            visualViewportHeight: round((after.visualViewport?.height ?? 0) - (beforeOrientation.visualViewport?.height ?? 0)),
        },
        panelStillOpen: !after.panelHidden && Boolean(after.panel),
    };
}

async function waitForPanelButton(page) {
    await page.waitForFunction(() => {
        const button = document.querySelector('.jpdb-subtitle-rail [data-action="panel"]');
        return button instanceof HTMLButtonElement && !button.disabled && getComputedStyle(button).display !== 'none';
    }, null, { timeout: liveMode ? 25_000 : 15_000 });
}

async function waitForPanelOpen(page) {
    await page.waitForFunction(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        if (!(panel instanceof HTMLElement) || panel.hidden) return false;
        const rect = panel.getBoundingClientRect();
        return rect.width > 240 && rect.height > 100;
    }, null, { timeout: liveMode ? 12_000 : 8_000 });
}

async function waitForPanelInteractive(page) {
    await page.waitForFunction(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        const handle = document.querySelector('[data-resize-transcript]');
        if (!(panel instanceof HTMLElement) || !(handle instanceof HTMLElement) || panel.hidden) return false;
        if (panel.classList.contains('jpdb-subtitle-panel-entering') || panel.classList.contains('jpdb-subtitle-panel-closing')) return false;
        const rect = handle.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit instanceof Element && (hit === handle || hit.closest('[data-resize-transcript]') === handle);
    }, null, { timeout: liveMode ? 8_000 : 5_000 });
}

async function waitForFullTranscriptRender(page) {
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-subtitle-list-row').length > 20, null, {
        timeout: liveMode ? 45_000 : 5_000,
    });
}

async function waitForKeylessVisualParse(page) {
    try {
        await page.waitForFunction(() => {
            const metrics = globalThis.__yomuSidebarResizeVisualParseMetrics?.();
            if (!metrics) return false;
            const page = metrics.pageVisible ?? metrics.page;
            const panel = metrics.panelVisible;
            const totalKnownPitch = page.knownPitchWords + metrics.overlay.knownPitchWords + panel.knownPitchWords;
            return page.words >= 3
                && page.furiWords >= 1
                && page.wordsWithoutPitch === 0
                && page.kanjiWordsWithoutFuri === 0
                && metrics.overlay.words >= 1
                && metrics.overlay.furiWords >= 1
                && metrics.overlay.wordsWithoutPitch === 0
                && metrics.overlay.kanjiWordsWithoutFuri === 0
                && panel.words >= 12
                && panel.furiWords >= 6
                && panel.wordsWithoutPitch === 0
                && panel.kanjiWordsWithoutFuri === 0
                && totalKnownPitch >= 1;
        }, null, { timeout: 7_000 });
    } catch (error) {
        const evidence = await keylessVisualParseEvidence(page).catch(() => null);
        if (keylessVisualSoftFail) return;
        throw new Error(`${String(error)}\nkeyless visual parse metrics: ${JSON.stringify(evidence)}`);
    }
}

async function keylessVisualParseEvidence(page) {
    const after = await snapshot(page);
    return after.visualParse;
}

async function waitForPanelSizeChanged(page, before, timeout) {
    return await page.waitForFunction(({ width, height }) => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        if (!(panel instanceof HTMLElement)) return false;
        const rect = panel.getBoundingClientRect();
        return Math.abs(rect.width - width) > 24 || Math.abs(rect.height - height) > 24;
    }, before, { timeout }).then(() => true, () => false);
}

async function waitForVisibleTranscriptParse(page) {
    await page.waitForFunction(() => {
        const metrics = globalThis.__yomuSidebarResizeVisualParseMetrics?.();
        if (!metrics) return false;
        const panel = metrics.panelVisible;
        return panel.words >= 12
            && panel.kanjiWords > 0
            && panel.kanjiWordsWithoutFuri === 0
            && panel.knownPitchWords > 0;
    }, null, { timeout: 7_000 }).catch(() => undefined);
}

async function waitForVisiblePageParse(page) {
    await page.waitForFunction(() => {
        const metrics = globalThis.__yomuSidebarResizeVisualParseMetrics?.();
        if (!metrics) return false;
        const page = metrics.pageVisible ?? metrics.page;
        return page.words >= 3
            && page.kanjiWordsWithoutFuri === 0
            && page.wordsWithoutPitch === 0
            && page.knownPitchWords > 0;
    }, null, { timeout: 7_000 }).catch(() => undefined);
}

async function waitForViewport(page, viewport) {
    await page.waitForFunction(expected => innerWidth === expected.width && innerHeight === expected.height, viewport, { timeout: 3000 });
}

async function waitForPanelSettledInViewport(page) {
    await page.waitForFunction(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        if (!(panel instanceof HTMLElement) || panel.hidden) return false;
        const rect = panel.getBoundingClientRect();
        const placement = document.querySelector('.jpdb-subtitle-player')?.getAttribute('data-transcript-placement')
            || panel.getAttribute('data-transcript-placement')
            || '';
        if (placement === 'bottom') {
            return Math.abs(rect.bottom - innerHeight) <= 2
                && rect.left >= -2
                && rect.right <= innerWidth + 2;
        }
        return rect.left >= -2
            && rect.top >= -2
            && rect.right <= innerWidth + 2
            && rect.bottom <= innerHeight + 2;
    }, null, { timeout: liveMode ? 5_000 : 3_000 });
}

async function waitForFrames(page, count) {
    await page.evaluate(frameCount => new Promise(resolve => {
        let remaining = frameCount;
        const tick = () => {
            remaining -= 1;
            if (remaining <= 0) resolve();
            else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }), count);
}

async function panelSize(page) {
    return await page.evaluate(() => {
        const rect = document.querySelector('.jpdb-subtitle-list')?.getBoundingClientRect();
        return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
    });
}

async function screenshot(page, directory, name) {
    const path = join(directory, `${name}.png`);
    await page.screenshot({ path, fullPage: false }).catch(error => {
        writeFileSync(join(directory, `${name}.screenshot-error.txt`), String(error?.message || error));
    });
}

async function snapshot(page) {
    return await page.evaluate(() => {
        const rect = selector => {
            const element = document.querySelector(selector);
            if (!(element instanceof Element)) return null;
            const box = element.getBoundingClientRect();
            return {
                left: box.left,
                top: box.top,
                right: box.right,
                bottom: box.bottom,
                width: box.width,
                height: box.height,
            };
        };
        const style = selector => {
            const element = document.querySelector(selector);
            if (!(element instanceof HTMLElement)) return null;
            const styles = getComputedStyle(element);
            return {
                display: styles.display,
                position: styles.position,
                width: element.style.width,
                height: element.style.height,
                maxWidth: element.style.maxWidth,
                maxHeight: element.style.maxHeight,
                marginLeft: element.style.marginLeft,
                marginRight: element.style.marginRight,
                transform: styles.transform,
            };
        };
        const handle = document.querySelector('[data-resize-transcript]');
        const visualParseMetrics = () => {
            const allWords = Array.from(document.querySelectorAll('.jpdb-reader-word')).filter(word => word instanceof HTMLElement);
            const overlayRoot = document.querySelector('.jpdb-subtitle-primary');
            const panelRoot = document.querySelector('.jpdb-subtitle-list');
            const panelScroller = document.querySelector('.jpdb-subtitle-list-scroll');
            const overlayWords = allWords.filter(word => overlayRoot?.contains(word));
            const overlayVisibleWords = overlayWords.filter(isVisiblePageWord);
            const panelWords = allWords.filter(word => panelRoot?.contains(word));
            const panelVisibleWords = panelWords.filter(word => isVisibleTranscriptWord(word, panelScroller));
            const pageWords = allWords.filter(word => !overlayRoot?.contains(word)
                && !panelRoot?.contains(word)
                && !word.closest('[data-jpdb-reader-root]'));
            const pageVisibleWords = pageWords.filter(word => isVisiblePageWord(word) && !isChromeButtonWord(word));
            return {
                page: wordMetrics(pageWords),
                pageVisible: wordMetrics(pageVisibleWords),
                overlay: wordMetrics(overlayVisibleWords),
                panel: wordMetrics(panelWords),
                panelVisible: wordMetrics(panelVisibleWords),
            };
        };
        globalThis.__yomuSidebarResizeVisualParseMetrics = visualParseMetrics;
        return {
            url: location.href,
            placement: document.querySelector('.jpdb-subtitle-player')?.getAttribute('data-transcript-placement')
                || document.querySelector('.jpdb-subtitle-list')?.getAttribute('data-transcript-placement')
                || '',
            viewport: { width: innerWidth, height: innerHeight },
            visualViewport: window.visualViewport
                ? { width: window.visualViewport.width, height: window.visualViewport.height, scale: window.visualViewport.scale }
                : null,
            scroll: {
                x: scrollX,
                y: scrollY,
                maxY: Math.max(0, (document.scrollingElement ?? document.documentElement).scrollHeight - innerHeight),
            },
            documentWidth: document.documentElement.scrollWidth,
            documentHeight: document.documentElement.scrollHeight,
            panel: rect('.jpdb-subtitle-list'),
            handle: rect('[data-resize-transcript]'),
            video: rect('#movie_player, .html5-video-player'),
            videoContainer: rect('#movie_player .html5-video-container, .html5-video-player .html5-video-container'),
            actualVideo: rect('#movie_player video.html5-main-video, .html5-video-player video.html5-main-video, #movie_player video, .html5-video-player video'),
            primary: rect('#primary'),
            columns: rect('#columns'),
            title: rect('ytd-watch-metadata h1, ytm-slim-video-metadata-renderer h2'),
            actions: rect('#actions, ytm-slim-video-action-bar-renderer'),
            description: rect('#description, ytm-expandable-video-description-body-renderer, ytm-description-shelf-renderer'),
            rowCount: transcriptRowCount(),
            mountedRowCount: document.querySelectorAll('.jpdb-subtitle-list-row').length,
            transcript: transcriptListState(),
            panelHidden: document.querySelector('.jpdb-subtitle-list')?.hasAttribute('hidden') ?? true,
            panelStyle: style('.jpdb-subtitle-list'),
            playerStyle: style('#player'),
            moviePlayerStyle: style('#movie_player, .html5-video-player'),
            videoContainerStyle: style('#movie_player .html5-video-container, .html5-video-player .html5-video-container'),
            actualVideoStyle: style('#movie_player video.html5-main-video, .html5-video-player video.html5-main-video, #movie_player video, .html5-video-player video'),
            rootClasses: document.documentElement.className,
            videoInset: document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset'),
            visualParse: visualParseMetrics(),
            handleAria: handle instanceof HTMLElement ? {
                orientation: handle.getAttribute('aria-orientation'),
                valueNow: handle.getAttribute('aria-valuenow'),
                valueMin: handle.getAttribute('aria-valuemin'),
                valueMax: handle.getAttribute('aria-valuemax'),
            } : null,
            yomuSetSizeCalls: globalThis.__yomuSetSizeCalls ?? [],
        };

        function transcriptListState() {
            const scroller = document.querySelector('.jpdb-subtitle-list-scroll');
            if (!(scroller instanceof HTMLElement)) return null;
            const scrollerRect = scroller.getBoundingClientRect();
            const rows = Array.from(scroller.querySelectorAll('.jpdb-subtitle-list-row'));
            const visibleRows = rows
                .map(row => ({ row, rect: row.getBoundingClientRect() }))
                .filter(({ rect }) => rect.bottom >= scrollerRect.top && rect.top <= scrollerRect.bottom);
            const visibleIndexes = visibleRows
                .map(({ row }) => Number(row.getAttribute('data-row-index')))
                .filter(Number.isFinite);
            const blankVisibleRows = visibleRows.filter(({ row }) => !(row.textContent ?? '').trim()).length;
            return {
                scrollTop: scroller.scrollTop,
                scrollHeight: scroller.scrollHeight,
                clientHeight: scroller.clientHeight,
                visibleRows: visibleRows.length,
                blankVisibleRows,
                firstVisibleIndex: visibleIndexes.length ? Math.min(...visibleIndexes) : null,
                lastVisibleIndex: visibleIndexes.length ? Math.max(...visibleIndexes) : null,
            };
        }

        function transcriptRowCount() {
            const totalRows = Number(document.querySelector('.jpdb-subtitle-list-scroll')?.getAttribute('data-total-rows'));
            return Number.isFinite(totalRows) && totalRows > 0
                ? totalRows
                : document.querySelectorAll('.jpdb-subtitle-list-row').length;
        }

        function wordMetrics(words) {
            const pitchClasses = ['heiban', 'atamadaka', 'nakadaka', 'odaka', 'kifuku'];
            const hasPitch = word => Array.from(word.classList).some(className => className.startsWith('jpdb-pitch-'));
            const hasKnownPitch = word => pitchClasses.some(name => word.classList.contains(`jpdb-pitch-${name}`));
            const needsPitchClass = word => !word.classList.contains('jpdb-reader-particle');
            const kanjiWords = words.filter(word => /[\u3400-\u9fff〆ヵヶ]/u.test(word.textContent ?? ''));
            const wordsWithoutPitch = words.filter(word => needsPitchClass(word) && !hasPitch(word));
            const kanjiWordsWithoutFuri = kanjiWords.filter(word => !word.querySelector('rt'));
            return {
                words: words.length,
                furiWords: words.filter(word => word.querySelector('rt')).length,
                pitchWords: words.filter(hasPitch).length,
                knownPitchWords: words.filter(hasKnownPitch).length,
                unknownPitchWords: words.filter(word => word.classList.contains('jpdb-pitch-unknown')).length,
                wordsWithoutPitch: wordsWithoutPitch.length,
                kanjiWords: kanjiWords.length,
                kanjiWordsWithoutFuri: kanjiWordsWithoutFuri.length,
                samples: {
                    wordsWithoutPitch: wordsWithoutPitch.slice(0, 8).map(wordSample),
                    kanjiWordsWithoutFuri: kanjiWordsWithoutFuri.slice(0, 8).map(wordSample),
                },
            };
        }

        function isVisibleTranscriptWord(word, scroller) {
            if (!(scroller instanceof HTMLElement)) return false;
            const row = word.closest('.jpdb-subtitle-list-row');
            if (!(row instanceof HTMLElement)) return false;
            const rect = row.getBoundingClientRect();
            const scrollerRect = scroller.getBoundingClientRect();
            return rect.bottom >= scrollerRect.top && rect.top <= scrollerRect.bottom;
        }

        function isVisiblePageWord(word) {
            const rect = word.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return false;
            if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) return false;
            const styles = getComputedStyle(word);
            return styles.visibility !== 'hidden' && styles.display !== 'none';
        }

        function isChromeButtonWord(word) {
            return Boolean(word.closest([
                'button',
                '[role="button"]',
                'a[role="button"]',
                'yt-button-shape',
                'yt-button-view-model',
                'button-view-model',
                'ytd-button-renderer',
                'ytd-menu-renderer',
                'ytd-topbar-menu-button-renderer',
                'ytd-notification-topbar-button-renderer',
            ].join(',')));
        }

        function wordSample(word) {
            const rect = word.getBoundingClientRect();
            return {
                text: (word.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
                surface: word.getAttribute('data-surface') ?? '',
                expression: word.getAttribute('data-expression') ?? '',
                reading: word.getAttribute('data-reading') ?? '',
                pitchClass: word.getAttribute('data-pitch-class') ?? '',
                source: word.getAttribute('data-card-source') ?? '',
                classes: Array.from(word.classList).slice(0, 8),
                rect: {
                    left: Math.round(rect.left),
                    top: Math.round(rect.top),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                },
            };
        }
    });
}

function compactSnapshot(state) {
    return {
        placement: state.placement,
        viewport: state.viewport,
        visualViewport: roundVisualViewport(state.visualViewport),
        scroll: roundScroll(state.scroll),
        documentWidth: Math.round(state.documentWidth ?? 0),
        documentHeight: Math.round(state.documentHeight ?? 0),
        panel: roundRect(state.panel),
        handle: roundRect(state.handle),
        video: roundRect(state.video),
        title: roundRect(state.title),
        actions: roundRect(state.actions),
        description: roundRect(state.description),
        rowCount: state.rowCount,
        mountedRowCount: state.mountedRowCount,
        transcript: state.transcript ? {
            scrollTop: Math.round(state.transcript.scrollTop),
            scrollHeight: Math.round(state.transcript.scrollHeight),
            clientHeight: Math.round(state.transcript.clientHeight),
            visibleRows: state.transcript.visibleRows,
            blankVisibleRows: state.transcript.blankVisibleRows,
            firstVisibleIndex: state.transcript.firstVisibleIndex,
            lastVisibleIndex: state.transcript.lastVisibleIndex,
        } : null,
        visualParse: state.visualParse,
        panelHidden: state.panelHidden,
        handleAria: state.handleAria,
        videoInset: state.videoInset,
        panelStyle: state.panelStyle,
        videoContainer: state.videoContainer ? roundRect(state.videoContainer) : null,
        actualVideo: state.actualVideo ? roundRect(state.actualVideo) : null,
        videoContainerStyle: state.videoContainerStyle,
        actualVideoStyle: state.actualVideoStyle,
        setSizeCallCount: state.yomuSetSizeCalls?.length ?? 0,
    };
}

function layoutProblems(state, requestedPlacement, stepName) {
    return [
        ...layoutUsabilityProblems(state, stepName),
        ...stableSideLayoutProblems(state),
        ...viewportLayoutProblems(state),
        ...placementLayoutProblems(state, requestedPlacement),
    ];
}

function layoutUsabilityProblems(state, stepName) {
    const problems = [];
    if (!state.panel || state.panel.width < 120 || state.panel.height < 80) problems.push('missing usable transcript panel');
    if (!state.video || state.video.width < 160 || state.video.height < 90) problems.push('missing usable YouTube video box');
    if (state.rowCount < 20) problems.push(`transcript rendered only ${state.rowCount} rows`);
    if ((state.transcript?.blankVisibleRows ?? 0) > 0) problems.push(`${state.transcript.blankVisibleRows} visible transcript rows are blank`);
    if (state.panel && state.video && overlaps(state.panel, state.video) && !isExpectedBottomOverlapEvidence(state, stepName)) {
        problems.push('transcript panel overlaps video');
    }
    return problems;
}

function stableSideLayoutProblems(state) {
    const problems = [];
    if (state.video && /jpdb-subtitle-youtube-stable-side/.test(state.rootClasses || '')) {
        for (const [name, box] of [
            ['video container', state.videoContainer],
            ['actual video', state.actualVideo],
        ]) {
            if (!box) continue;
            if (box.left < state.video.left - 2) problems.push(`${name} starts before stable player`);
            if (box.right > state.video.right + 2) problems.push(`${name} extends past stable player`);
            if (box.width > state.video.width + 2) problems.push(`${name} is wider than stable player`);
        }
    }
    return problems;
}

function viewportLayoutProblems(state) {
    const problems = [];
    if (state.panel && state.panel.left < -2) problems.push('transcript panel extends past left viewport edge');
    if (state.panel && state.panel.right > state.viewport.width + 2) problems.push('transcript panel extends past right viewport edge');
    if (state.documentWidth > state.viewport.width + 8) problems.push(`document overflows viewport by ${Math.round(state.documentWidth - state.viewport.width)}px`);
    return problems;
}

function placementLayoutProblems(state, requestedPlacement) {
    const problems = [];
    if (state.placement === 'bottom') {
        if (state.panel && Math.abs(state.panel.bottom - state.viewport.height) > 3) problems.push('bottom transcript panel is not flush with the viewport bottom');
    } else if (requestedPlacement !== 'bottom' && state.viewport.width >= 700 && state.placement !== requestedPlacement) {
        problems.push(`expected ${requestedPlacement} side placement, saw ${state.placement || 'unknown'}`);
    }
    if (requestedPlacement === 'bottom' && state.placement !== 'bottom') problems.push(`expected bottom placement, saw ${state.placement || 'unknown'}`);
    return problems;
}

function visualParseProblems(state, stepName) {
    const metrics = state.visualParse;
    if (!metrics) return ['missing visual parse metrics'];
    if (stepName === 'open-sidebar') return [];
    const problems = [];
    const shouldCheckPage = stepName === 'keyless-visual-parse';
    const overlayMinimumWords = stepName === 'keyless-visual-parse' ? 1 : 0;
    const surfaces = [
        ...(shouldCheckPage ? [['visible page', metrics.pageVisible ?? metrics.page, 3]] : []),
        ['subtitle overlay', metrics.overlay, overlayMinimumWords],
        ['visible transcript panel', metrics.panelVisible ?? metrics.panel, stepName === 'loaded' ? 0 : 12],
    ];
    for (const [label, surface, minimumWords] of surfaces) {
        if (!surface || surface.words < minimumWords) {
            problems.push(`${label} has only ${surface?.words ?? 0} parsed words`);
            continue;
        }
        if (!keylessVisualSoftFail && surface.wordsWithoutPitch > 0) problems.push(`${label} has ${surface.wordsWithoutPitch} parsed words without pitch classes`);
        if (!keylessVisualSoftFail && surface.kanjiWordsWithoutFuri > 0) problems.push(`${label} has ${surface.kanjiWordsWithoutFuri} kanji words without furigana`);
    }
    const page = metrics.pageVisible ?? metrics.page;
    const panel = metrics.panelVisible ?? metrics.panel;
    const totalKnownPitch = page.knownPitchWords + metrics.overlay.knownPitchWords + panel.knownPitchWords;
    if (!keylessVisualSoftFail && stepName !== 'loaded' && totalKnownPitch < 1) problems.push('no known pitch accent classes appeared across parsed surfaces');
    return problems;
}

function layoutWarnings(state, stepName) {
    const warnings = [];
    if (state.panel && state.video && overlaps(state.panel, state.video) && isExpectedBottomOverlapEvidence(state, stepName)) {
        warnings.push(stepName === 'open-sidebar'
            ? 'initial bottom transcript panel overlaps video before the scripted resize'
            : 'bottom transcript panel overlaps video in a cramped mobile landscape viewport');
    }
    return warnings;
}

function performanceProblems(steps) {
    const problems = [];
    const openSidebarTargetMs = liveMode ? 2_500 : 180;
    const fullTranscriptTargetMs = liveMode ? 45_000 : 1_200;
    const longTaskTargetMs = liveMode ? 300 : 180;
    const dragFrameGapTargetMs = liveMode ? 240 : 240;
    for (const step of steps) {
        if (step.name === 'open-sidebar' && step.durationMs > openSidebarTargetMs) {
            problems.push(`open-sidebar took ${step.durationMs}ms, above ${openSidebarTargetMs}ms target`);
        }
        if (step.name === 'full-transcript-render' && step.durationMs > fullTranscriptTargetMs) {
            problems.push(`full-transcript-render took ${step.durationMs}ms, above ${fullTranscriptTargetMs}ms target`);
        }
        const stepLongTaskTargetMs = step.name === 'orientation-change'
            ? (liveMode ? 360 : 220)
            : longTaskTargetMs;
        if (step.maxLongTaskMs > stepLongTaskTargetMs) {
            problems.push(`${step.name} had a ${step.maxLongTaskMs}ms long task, above ${stepLongTaskTargetMs}ms target`);
        }
        if (step.name === 'drag-resize' && step.maxFrameGapMs > dragFrameGapTargetMs) {
            problems.push(`drag-resize had a ${step.maxFrameGapMs}ms max frame gap, above ${dragFrameGapTargetMs}ms target`);
        }
    }
    return problems;
}

function credentialProblems(requestLog) {
    if (!keylessMode) return [];
    const privateJpdbParse = requestLog.filter(entry => entry.kind === 'jpdb-parse-keyless-blocked');
    return privateJpdbParse.length
        ? [`keyless mode attempted ${privateJpdbParse.length} JPDB parse API request(s)`]
        : [];
}

function isExpectedBottomOverlapEvidence(state, stepName) {
    return isCrampedMobileBottomLayout(state) || isBottomDrawerTooTallToFitBelowVideo(state);
}

function isCrampedMobileBottomLayout(state) {
    return state.placement === 'bottom'
        && state.viewport.height < 480
        && (state.video?.bottom ?? 0) > state.viewport.height;
}

function isBottomDrawerTooTallToFitBelowVideo(state) {
    if (state.placement !== 'bottom' || !state.panel || !state.video) return false;
    const availableBelowVideo = state.viewport.height - state.video.bottom;
    return state.panel.height > availableBelowVideo - 8;
}

function overlaps(a, b) {
    return Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
}

function roundRect(rect) {
    if (!rect) return null;
    return Object.fromEntries(['left', 'top', 'right', 'bottom', 'width', 'height'].map(key => [key, Math.round(rect[key])]));
}

function roundVisualViewport(viewport) {
    if (!viewport) return null;
    return {
        width: round(viewport.width),
        height: round(viewport.height),
        scale: round(viewport.scale),
    };
}

function roundScroll(scroll) {
    if (!scroll) return null;
    return {
        x: Math.round(scroll.x ?? 0),
        y: Math.round(scroll.y ?? 0),
        maxY: Math.round(scroll.maxY ?? 0),
    };
}

function round(value) {
    return Math.round(Number(value || 0) * 10) / 10;
}

function roundTotal(entries, key) {
    return round(entries.reduce((total, entry) => total + Number(entry[key] || 0), 0));
}

function roundMax(entries, key) {
    return round(entries.reduce((max, entry) => Math.max(max, Number(entry[key] || 0)), 0));
}

async function installConsentCookies(context) {
    await context.addCookies([
        { name: 'CONSENT', value: 'YES+cb.20240101-08-p0.ja+FX+667', domain: '.youtube.com', path: '/' },
        { name: 'SOCS', value: 'CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMTA5LjA4X3AwGgJqYSACGgYIgJzqrQY', domain: '.youtube.com', path: '/' },
    ]).catch(() => undefined);
}

async function dismissConsent(page) {
    for (const selector of ['button:has-text("Accept all")', 'button:has-text("すべてに同意")', 'form[action*="consent"] button']) {
        const control = page.locator(selector).first();
        if (await control.count().catch(() => 0)) {
            await control.click({ timeout: 1500 }).catch(() => undefined);
            await page.waitForTimeout(1000);
        }
    }
}

async function installFixtureRoutes(page, requestLog) {
    await page.route('**/*', route => {
        requestLog.push({ kind: 'fixture-empty', url: redactUrl(route.request().url()) });
        return route.fulfill({ status: 204, body: '' });
    });
    await page.route('https://www.youtube.com/watch**', route => route.fulfill({
        body: youtubeFixtureHtml(false),
        contentType: 'text/html; charset=utf-8',
    }));
    await page.route('https://m.youtube.com/watch**', route => route.fulfill({
        body: youtubeFixtureHtml(true),
        contentType: 'text/html; charset=utf-8',
    }));
    await page.route('https://www.youtube.com/api/timedtext**', route => route.fulfill({
        body: youtubeTimedText(),
        contentType: 'text/xml; charset=utf-8',
    }));
    await page.route('https://m.youtube.com/api/timedtext**', route => route.fulfill({
        body: youtubeTimedText(),
        contentType: 'text/xml; charset=utf-8',
    }));
}

async function installApiMocks(page, requestLog) {
    if (liveJpdbMode || keylessMode) return;
    await page.route('https://jpdb.io/api/v1/parse', async route => {
        const body = JSON.parse(route.request().postData() || '{}');
        requestLog.push({ kind: 'jpdb-parse-route', chars: JSON.stringify(body.text ?? '').length });
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockJpdbParseFromVocabulary(body, vocabulary)),
        });
    });
}

async function bridgeResponse(request, requestLog) {
    const response = routeBridgeResponse(request, requestLog);
    if (response) return response;
    const liveResponse = await liveBridgeResponse(request, requestLog);
    if (liveResponse) return liveResponse;
    requestLog.push({ kind: 'bridge-passthrough-empty', method: request.method || 'GET', url: redactUrl(request.url) });
    return { status: 204, responseText: '', contentType: 'text/plain' };
}

function routeBridgeResponse(request, requestLog) {
    const parsed = new URL(request.url);
    const target = proxiedTargetUrl(parsed) ?? parsed;
    if ((request.method || 'GET').toUpperCase() === 'OPTIONS') return { status: 204, responseText: '', contentType: 'text/plain' };
    if (!liveMode && isYoutubeTimedTextUrl(target)) {
        requestLog.push({ kind: 'youtube-timedtext-bridge', url: redactUrl(target.href) });
        return {
            status: 200,
            responseText: youtubeTimedText(),
            contentType: 'text/xml; charset=utf-8',
        };
    }
    if (target.href.startsWith(jpdbParseUrl)) {
        if (keylessMode) {
            requestLog.push({ kind: 'jpdb-parse-keyless-blocked', ...jpdbParseRequestDetails(request), url: redactUrl(target.href) });
            return {
                status: 403,
                responseText: JSON.stringify({ error: 'JPDB parse API is disabled in keyless smoke mode.' }),
                contentType: 'application/json; charset=utf-8',
            };
        }
        if (liveJpdbMode) return null;
        const body = parseJsonBody(gmRequestFetchBody(request));
        requestLog.push({ kind: 'jpdb-parse-bridge', ...jpdbParseBodyDetails(body), url: redactUrl(target.href) });
        return {
            status: 200,
            responseText: JSON.stringify(mockJpdbParseFromVocabulary(body, vocabulary)),
            contentType: 'application/json; charset=utf-8',
        };
    }
    return null;
}

async function liveBridgeResponse(request, requestLog) {
    if (!liveMode) return null;
    const parsed = new URL(request.url);
    const target = proxiedTargetUrl(parsed) ?? parsed;
    if (!shouldLiveFetchBridgeUrl(target)) return null;
    const method = request.method || 'GET';
    const kind = liveBridgeKind(target);
    const details = liveBridgeRequestDetails(target, request);
    try {
        const response = await fetch(target.href, liveFetchInit(request, method));
        const responseText = await response.text();
        requestLog.push({ kind, status: response.status, chars: responseText.length, ...details, url: redactUrl(target.href) });
        return {
            status: response.status,
            responseText,
            contentType: response.headers.get('content-type') ?? 'text/plain; charset=utf-8',
        };
    } catch (error) {
        requestLog.push({ kind: `${kind}-failed`, error: bridgeErrorMessage(error), ...details, url: redactUrl(target.href) });
        return { status: 599, responseText: '', contentType: 'text/plain' };
    }
}

function liveBridgeRequestDetails(url, request) {
    if (url.href.startsWith(jpdbParseUrl)) return jpdbParseRequestDetails(request);
    if (isJpdbPublicLookupUrl(url)) {
        const query = url.searchParams.get('q') ?? '';
        return {
            path: url.pathname,
            query,
            requestChars: query.length,
        };
    }
    if (isJitenPublicUrl(url)) {
        const text = url.searchParams.get('text') ?? url.searchParams.get('q') ?? '';
        return {
            path: url.pathname,
            requestChars: text.length,
        };
    }
    if (isYoutubeTimedTextUrl(url)) {
        return {
            lang: url.searchParams.get('lang') ?? null,
            tlang: url.searchParams.get('tlang') ?? null,
            trackKind: url.searchParams.get('kind') ?? null,
        };
    }
    if (url.hostname === 'translate.googleapis.com') {
        const query = url.searchParams.getAll('q').join('\n');
        return {
            sourceLanguage: url.searchParams.get('sl') ?? null,
            targetLanguage: url.searchParams.get('tl') ?? null,
            requestItems: url.searchParams.getAll('q').length,
            requestChars: query.length,
        };
    }
    return {};
}

function jpdbParseRequestDetails(request) {
    const body = safeParseJsonBody(gmRequestFetchBody(request));
    return jpdbParseBodyDetails(body);
}

function jpdbParseBodyDetails(body) {
    const texts = Array.isArray(body.text)
        ? body.text.map(value => String(value))
        : body.text != null
            ? [String(body.text)]
            : [];
    return {
        requestItems: texts.length,
        requestChars: texts.reduce((total, text) => total + text.length, 0),
        requestJsonChars: JSON.stringify(body).length,
        requestSample: texts.slice(0, 3),
    };
}

function bridgeErrorMessage(error) {
    const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : undefined;
    return cause ? `${String(error)}; cause=${String(cause)}` : String(error);
}

function shouldLiveFetchBridgeUrl(url) {
    return isYoutubeTimedTextUrl(url)
        || url.hostname === 'translate.googleapis.com'
        || isJpdbPublicLookupUrl(url)
        || isJitenPublicUrl(url)
        || (liveJpdbMode && url.href.startsWith(jpdbParseUrl));
}

function liveBridgeKind(url) {
    if (isYoutubeTimedTextUrl(url)) return 'youtube-timedtext-live-bridge';
    if (url.href.startsWith(jpdbParseUrl)) return 'jpdb-parse-live-bridge';
    if (isJpdbPublicLookupUrl(url)) return 'jpdb-public-live-bridge';
    if (isJitenPublicUrl(url)) return 'jiten-public-live-bridge';
    return 'google-translate-live-bridge';
}

function isJpdbPublicLookupUrl(url) {
    return url.hostname === 'jpdb.io'
        && (url.pathname === '/search' || url.pathname.startsWith('/vocabulary/'));
}

function isJitenPublicUrl(url) {
    return url.hostname === 'api.jiten.moe'
        && url.pathname.startsWith('/api/');
}

function liveFetchInit(request, method) {
    const init = {
        method,
        headers: liveFetchHeaders(request.headers),
    };
    const body = gmRequestFetchBody(request);
    if (body != null && !/^(GET|HEAD)$/i.test(method)) init.body = body;
    return init;
}

function liveFetchHeaders(headers) {
    if (!headers || typeof headers !== 'object') return {};
    return Object.fromEntries(Object.entries(headers)
        .filter(([name, value]) => typeof name === 'string' && value != null)
        .map(([name, value]) => [name, String(value)]));
}

function isYoutubeTimedTextUrl(url) {
    return /(^|\.)youtube\.com$/.test(url.hostname) && url.pathname === '/api/timedtext';
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

function parseJsonBody(rawBody) {
    if (!rawBody) return {};
    if (Buffer.isBuffer(rawBody)) return JSON.parse(rawBody.toString('utf8'));
    if (typeof rawBody === 'string') return JSON.parse(rawBody || '{}');
    if (typeof rawBody === 'object') return rawBody;
    return {};
}

function safeParseJsonBody(rawBody) {
    try {
        return parseJsonBody(rawBody);
    } catch {
        return {};
    }
}

function smokeSettings(placement) {
    return {
        onboardingSeen: true,
        interfaceLanguage: 'en',
        apiKey: keylessMode ? '' : liveJpdbMode ? liveJpdbApiKey : 'profile-key',
        jitenApiKey: '',
        ankiEnabled: false,
        ankiSectionEnabled: false,
        localDictionariesEnabled: keylessMode,
        audioEnabled: false,
        jpdbDefinitionsEnabled: keylessMode,
        immersionKitEnabled: false,
        studyTranslationEnabled: false,
        studyGrammarEnabled: false,
        enableLogging: false,
        showFloatingButton: false,
        showPitchAccent: true,
        furiganaMode: 'all',
        subtitlePlayerEnabled: true,
        subtitleAutoDetect: true,
        subtitleOverlayVisible: true,
        subtitleSecondaryVisible: false,
        subtitlePausePanel: false,
        subtitleTranscriptVisible: false,
        subtitleTranscriptAutoScroll: false,
        subtitleTranscriptPlacement: placement,
        subtitleControlsMode: 'always',
    };
}

function scenarioUrl(viewport) {
    if (liveMode) return liveUrl;
    return viewport.name.startsWith('mobile') ? fixtureMobileWatchUrl : fixtureWatchUrl;
}

function selectPlacements() {
    const raw = process.env.YOMU_YOUTUBE_SIDEBAR_RESIZE_PLACEMENTS ?? 'right,left,bottom';
    const valid = new Set(['right', 'left', 'bottom']);
    const selected = raw.split(',').map(value => value.trim()).filter(Boolean);
    for (const placement of selected) {
        if (!valid.has(placement)) throw new Error(`Unknown placement: ${placement}`);
    }
    return selected;
}

function selectViewportSpecs() {
    const specs = new Map(defaultViewportSpecs().map(spec => [spec.name, spec]));
    const raw = process.env.YOMU_YOUTUBE_SIDEBAR_RESIZE_VIEWPORTS ?? [...specs.keys()].join(',');
    const selected = raw.split(',').map(value => value.trim()).filter(Boolean);
    for (const name of selected) {
        if (!specs.has(name)) throw new Error(`Unknown viewport: ${name}`);
    }
    return selected.map(name => specs.get(name));
}

function defaultViewportSpecs() {
    const iphone = devices['iPhone 13'];
    return [
        {
            name: 'ipad-pro-landscape',
            viewport: { width: 1366, height: 1024 },
            orientationViewport: { width: 1024, height: 1366 },
            contextOptions: {
                viewport: { width: 1366, height: 1024 },
                screen: { width: 1366, height: 1024 },
                deviceScaleFactor: 2,
                isMobile: true,
                hasTouch: true,
                userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            },
        },
        {
            name: 'ipad-pro-portrait',
            viewport: { width: 1024, height: 1366 },
            orientationViewport: { width: 1366, height: 1024 },
            contextOptions: {
                viewport: { width: 1024, height: 1366 },
                screen: { width: 1024, height: 1366 },
                deviceScaleFactor: 2,
                isMobile: true,
                hasTouch: true,
                userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            },
        },
        {
            name: 'mobile-iphone-13',
            viewport: iphone.viewport,
            orientationViewport: { width: iphone.viewport.height, height: iphone.viewport.width },
            contextOptions: iphone,
        },
        {
            name: 'desktop-1440',
            viewport: { width: 1440, height: 900 },
            orientationViewport: { width: 900, height: 1200 },
            contextOptions: {
                viewport: { width: 1440, height: 900 },
                screen: { width: 1440, height: 900 },
                deviceScaleFactor: 1,
                isMobile: false,
                hasTouch: false,
            },
        },
    ];
}

function summarizeRequests(requestLog) {
    const counts = new Map();
    const byKind = new Map();
    for (const item of requestLog) {
        counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
        const summary = byKind.get(item.kind) ?? {
            count: 0,
            responseChars: 0,
            requestChars: 0,
            requestItems: 0,
            maxRequestChars: 0,
            statuses: {},
        };
        summary.count += 1;
        summary.responseChars += Number(item.chars || 0);
        summary.requestChars += Number(item.requestChars || 0);
        summary.requestItems += Number(item.requestItems || 0);
        summary.maxRequestChars = Math.max(summary.maxRequestChars, Number(item.requestChars || 0));
        if (item.status !== undefined) summary.statuses[item.status] = (summary.statuses[item.status] ?? 0) + 1;
        byKind.set(item.kind, summary);
    }
    return {
        counts: Object.fromEntries(counts),
        byKind: Object.fromEntries([...byKind].map(([kind, summary]) => [kind, {
            ...summary,
            responseChars: Math.round(summary.responseChars),
            requestChars: Math.round(summary.requestChars),
            maxRequestChars: Math.round(summary.maxRequestChars),
        }])),
        samples: requestLog.slice(0, 16),
        parseSamples: requestLog.filter(item => item.kind.includes('parse')).slice(0, 16),
    };
}

function redactUrl(url) {
    return String(url).replace(/profile-key|mock-jpdb-token|api_key=[^&]+/g, '[redacted]');
}

function writeReport(value) {
    writeFileSync(join(outputRoot, 'report.json'), `${JSON.stringify(value, null, 2)}\n`);
}

function youtubeTimedText() {
    const lines = [
        ['今日は', '日本語', '字幕', 'を', '確認', 'します'],
        ['左側', 'でも', '動画', 'を', '隠しません'],
        ['下側', 'では', '説明', 'と', '操作', 'を', '広げません'],
        ['向き', '変更', 'しても', '余白', 'を', '保ちます'],
    ];
    const body = Array.from({ length: 132 }, (_, index) => {
        const words = lines[index % lines.length];
        const start = 1000 + index * 2100;
        const segments = words.map((word, wordIndex) => `<s t="${wordIndex * 280}">${word}</s>`).join('');
        return `<p t="${start}" d="1900">${segments}</p>`;
    }).join('\n');
    return `<timedtext><body>${body}</body></timedtext>`;
}

function youtubeFixtureHtml(mobile) {
    const playerResponse = {
        videoDetails: { videoId: 'p044fixture' },
        captions: {
            playerCaptionsTracklistRenderer: {
                captionTracks: [{
                    baseUrl: `https://${mobile ? 'm' : 'www'}.youtube.com/api/timedtext?v=p044fixture&lang=ja`,
                    languageCode: 'ja',
                    vssId: '.ja',
                    name: { simpleText: 'Japanese' },
                }],
            },
        },
    };
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>YouTube sidebar resize fixture</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; overflow-x: hidden; }
    ytd-watch-flexy, ytm-watch { display: block; }
    #columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 360px); gap: 24px; max-width: 1720px; margin: 0 auto; padding: 72px 24px 32px; box-sizing: border-box; align-items: start; }
    #primary, #primary-inner { min-width: 0; box-sizing: border-box; }
    #player, #player-container-outer, #player-container-inner, ytd-player { display: block; min-width: 0; }
    #movie_player { position: relative; width: 100%; aspect-ratio: 16 / 9; min-height: 320px; background: #000; overflow: hidden; }
    #movie_player .html5-video-container { position: absolute; inset: 0; width: 100%; height: 100%; }
    #movie_player video { position: absolute; display: block; width: 100%; height: 100%; background: linear-gradient(135deg, #111, #252525); }
    .ytp-caption-window-container { position: absolute; left: 20%; right: 20%; bottom: 64px; text-align: center; font-size: 28px; text-shadow: 0 2px 4px #000; }
    ytd-watch-metadata, ytm-slim-video-metadata-renderer { display: block; min-width: 0; padding-top: 18px; }
    ytd-watch-metadata h1, ytm-slim-video-metadata-renderer h2 { margin: 0 0 14px; font-size: 24px; line-height: 1.28; font-weight: 650; overflow-wrap: anywhere; }
    #actions, ytm-slim-video-action-bar-renderer { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; min-width: 0; }
    #actions button, ytm-slim-video-action-bar-renderer button { border: 0; border-radius: 18px; padding: 8px 14px; color: #f1f1f1; background: #272727; font: inherit; }
    #description, ytm-expandable-video-description-body-renderer { display: block; max-width: 100%; box-sizing: border-box; border-radius: 8px; padding: 12px 14px; background: #272727; color: #ddd; line-height: 1.5; overflow-wrap: anywhere; }
    #secondary { display: grid; gap: 14px; min-width: 0; color: #ddd; }
    ytd-compact-video-renderer { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 10px; min-width: 0; }
    .thumb { min-height: 78px; border-radius: 8px; background: #303030; }
    ytd-compact-video-renderer a { color: #f1f1f1; text-decoration: none; line-height: 1.35; }
    @media (max-width: 699px) {
      #columns { display: block; padding: 56px 12px 24px; }
      #secondary { margin-top: 18px; }
      #movie_player { min-height: 210px; }
      ytd-watch-metadata h1, ytm-slim-video-metadata-renderer h2 { font-size: 19px; }
    }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};
    for (const name of ['ytd-watch-flexy', 'ytm-watch', 'ytd-player', 'ytd-watch-metadata', 'ytm-slim-video-metadata-renderer', 'ytm-slim-video-action-bar-renderer', 'ytm-expandable-video-description-body-renderer', 'ytd-compact-video-renderer']) {
      if (!customElements.get(name)) customElements.define(name, class extends HTMLElement {});
    }
  </script>
</head>
<body>
  <${mobile ? 'ytm-watch' : 'ytd-watch-flexy'} video-id="p044fixture">
    <main id="columns">
      <section id="primary">
        <div id="primary-inner">
          <div id="player"><div id="player-container-outer"><div id="player-container-inner"><ytd-player>
            <div id="movie_player">
              <div class="html5-video-container" style="width:1008px;height:567px">
                <video class="html5-main-video" controls muted playsinline style="left:0;top:0;width:1008px;height:567px;object-fit:cover"></video>
              </div>
              <div class="ytp-caption-window-container"><span class="ytp-caption-segment">今日は日本語字幕を確認します</span></div>
            </div>
          </ytd-player></div></div></div>
          <${mobile ? 'ytm-slim-video-metadata-renderer' : 'ytd-watch-metadata'}>
            <${mobile ? 'h2' : 'h1'}>日本語タイトルと説明を確認するための動画</${mobile ? 'h2' : 'h1'}>
            <${mobile ? 'ytm-slim-video-action-bar-renderer' : 'div'} id="actions">
              <button type="button">Like</button><button type="button">Share</button><button type="button">Save</button><button type="button">Clip</button>
            </${mobile ? 'ytm-slim-video-action-bar-renderer' : 'div'}>
            <${mobile ? 'ytm-expandable-video-description-body-renderer' : 'div'} id="description">これは説明欄です。下側の文字起こしパネルでも横幅が異常に広がらず、ボタンやタイトルと同じ列に収まります。</${mobile ? 'ytm-expandable-video-description-body-renderer' : 'div'}>
          </${mobile ? 'ytm-slim-video-metadata-renderer' : 'ytd-watch-metadata'}>
        </div>
      </section>
      <aside id="secondary">
        ${Array.from({ length: 24 }, (_, index) => `<ytd-compact-video-renderer><div class="thumb"></div><a href="/watch?v=${index}">おすすめ動画 ${index + 1} と日本語の説明</a></ytd-compact-video-renderer>`).join('')}
      </aside>
    </main>
  </${mobile ? 'ytm-watch' : 'ytd-watch-flexy'}>
  <script>
    const player = document.querySelector('#movie_player');
    const video = document.querySelector('video');
    globalThis.__yomuSetSizeCalls = [];
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 12 });
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 1.4 });
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 });
    player.getVideoData = () => ({ video_id: 'p044fixture' });
    player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
    player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    player.setOption = () => {};
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setSize = (width, height) => {
      globalThis.__yomuSetSizeCalls.push({ width, height, at: performance.now() });
      player.style.width = width + 'px';
      player.style.height = height + 'px';
    };
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('loadeddata'));
  </script>
</body>
</html>`;
}
