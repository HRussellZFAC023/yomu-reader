#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, devices } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    createSmokePaths,
    gmRequestFetchBody,
    launchSmokeBrowser,
    mockJpdbParseFromVocabulary,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath, cssPath, root, artifacts } = createSmokePaths(import.meta.dirname);
const REQUEST_BRIDGE_NAME = '__yomuYoutubeSidebarLayoutRequest';
const JPDB_PARSE_URL = 'https://jpdb.io/api/v1/parse';
const defaultCompanionDir = existsSync(join(root, 'dist/greasyfork'))
    ? join(root, 'dist/greasyfork')
    : join(root, 'docs/public/greasyfork');
const companionDir = resolve(process.env.YOMU_YOUTUBE_SIDEBAR_COMPANION_DIR ?? defaultCompanionDir);
const companionPaths = ['yomu-anki.user.js', 'yomu-kanji-study.user.js', 'yomu-settings-surface.user.js', 'yomu-video.user.js']
    .map(name => join(companionDir, name));
const outputDir = resolve(process.env.YOMU_YOUTUBE_SIDEBAR_OUTPUT_DIR ?? join(artifacts, 'youtube-sidebar-matrix', 'working'));
const headed = process.env.YOMU_YOUTUBE_SIDEBAR_HEADED === '1';
const placements = ['right', 'left', 'bottom'];
const viewports = [
    { name: 'ipad-pro-portrait', viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { name: 'ipad-pro-landscape', viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { name: 'mobile-iphone-13', ...devices['iPhone 13'] },
    { name: 'desktop-1440', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

assertBuiltArtifacts([scriptPath, cssPath, ...companionPaths], root);
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: !headed });
const results = [];
try {
    for (const viewport of viewports) {
        for (const placement of placements) {
            console.error(`[youtube-sidebar] ${viewport.name} ${placement}`);
            results.push(await runScenario(browser, viewport, placement));
        }
    }
} finally {
    await browser.close();
}

const summary = { outputDir, results };
writeFileSync(join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

async function runScenario(browser, viewport, placement) {
    const { name: _name, defaultBrowserType: _defaultBrowserType, ...contextOptions } = viewport;
    const context = await browser.newContext({
        ...contextOptions,
        bypassCSP: true,
        locale: 'ja-JP',
    });
    await context.exposeFunction(REQUEST_BRIDGE_NAME, request => bridgeResponse(request));
    await context.addInitScript({
        content: [...companionPaths, scriptPath].map(filePath => readFileSync(filePath, 'utf8')).join('\n;\n'),
    });
    const page = await context.newPage();
    const label = `${viewport.name}-${placement}`;
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => {
        if (message.type() === 'error' && /yomu|jpdb/i.test(message.text())) errors.push(message.text());
    });
    try {
        await installFixtureRoutes(page);
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: smokeSettings(placement),
            css: readFileSync(cssPath, 'utf8'),
            requestBridgeName: REQUEST_BRIDGE_NAME,
        });
        await page.goto('https://www.youtube.com/watch?v=p044fixture', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await installUserscriptCssResource(page, cssPath);
        await page.waitForSelector('.jpdb-subtitle-player', { state: 'attached', timeout: 10000 });
        await waitForPanelButton(page);
        await page.screenshot({ path: join(outputDir, `${label}-before.png`), fullPage: false });

        const openTiming = await timePageAction(page, async () => {
            await page.locator('.jpdb-subtitle-rail [data-action="panel"]').evaluate(button => button.click());
            await waitForPanelOpen(page);
        });
        const afterOpen = await snapshot(page);
        assertLayout(afterOpen, viewport.name, assertedPlacementForState(placement, afterOpen), 'open');
        await page.screenshot({ path: join(outputDir, `${label}-open.png`), fullPage: false });
        await waitForFullTranscriptRender(page);
        const afterFullRender = await snapshot(page);
        assert(afterOpen.rowCount <= 4, `panel open did not use the lightweight preview path in ${label}`, compactSnapshot(afterOpen));
        assert(afterFullRender.rowCount >= 50, `full transcript did not render after the preview in ${label}`, compactSnapshot(afterFullRender));
        assertLayout(afterFullRender, viewport.name, assertedPlacementForState(placement, afterFullRender), 'full-render');
        const activeCueStability = viewport.name === 'ipad-pro-portrait' && placement === 'right'
            ? await runCurrentLineStabilitySequence(page)
            : null;

        const resizeTiming = await timePageAction(page, async () => {
            await resizeTranscriptPanelByKeyboard(page, afterFullRender.placement);
        });
        const afterResize = await snapshot(page);
        assertLayout(afterResize, viewport.name, assertedPlacementForState(placement, afterResize), 'resize');
        if (placement === 'bottom' || afterResize.placement === 'bottom') assertBottomResizePreservedPageContent(afterFullRender, afterResize, label);
        await page.screenshot({ path: join(outputDir, `${label}-resized.png`), fullPage: false });

        const switchTiming = viewport.name === 'ipad-pro-portrait' && placement === 'right'
            ? await runSwitchSequence(page)
            : null;
        const autoTiming = viewport.name === 'ipad-pro-portrait' && placement === 'right'
            ? await runAutoSequence(page)
            : null;

        return {
            label,
            requestedPlacement: placement,
            effectivePlacement: afterOpen.placement,
            openMs: openTiming.durationMs,
            resizeMs: resizeTiming.durationMs,
            previewRows: afterOpen.rowCount,
            fullRows: afterFullRender.rowCount,
            switchTiming,
            autoTiming,
            activeCueStability,
            coercedToBottom: placement !== 'bottom' && afterOpen.placement === 'bottom',
            beforeSetSizeCount: afterOpen.setSizeCalls.length,
            afterResizeSetSizeCount: afterResize.setSizeCalls.length,
            resizeEvents: afterResize.resizeEvents,
            snapshot: compactSnapshot(afterResize),
            errors: errors.slice(0, 5),
        };
    } finally {
        await context.close();
    }
}

function assertedPlacementForState(requestedPlacement, state) {
    return state.viewport.width < 700 && requestedPlacement !== 'bottom' ? 'bottom' : requestedPlacement;
}

async function runCurrentLineStabilitySequence(page) {
    const samples = [];
    for (let index = 0; index < 6; index += 1) {
        await page.evaluate(() => {
            const video = document.querySelector('video');
            if (!video) return;
            Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 3.055 });
            video.dispatchEvent(new Event('timeupdate'));
        });
        await page.waitForTimeout(80);
        samples.push(await activeTranscriptSample(page));
    }
    const stableRowIndex = samples[0]?.activeRows[0]?.rowIndex;
    assert(
        stableRowIndex !== undefined
            && samples.every(sample => sample.activeRows.length === 1 && sample.activeRows[0]?.rowIndex === stableRowIndex),
        'open sidebar current line oscillated at adjacent cue boundary',
        { samples },
    );
    return { samples };
}

async function activeTranscriptSample(page) {
    return page.evaluate(() => ({
        activeRows: [...document.querySelectorAll('.jpdb-subtitle-list-row.active')].map(row => ({
            rowIndex: row.getAttribute('data-row-index'),
            cueIndex: row.getAttribute('data-cue-index'),
            text: row.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        })),
    }));
}

async function runAutoSequence(page) {
    await page.evaluate(() => {
        const video = document.querySelector('video');
        Object.defineProperty(video, 'paused', { configurable: true, value: true });
        Object.defineProperty(video, 'ended', { configurable: true, value: false });
    });
    const enableTiming = await timePageAction(page, async () => {
        await page.locator('[data-action="toggle-pause-panel"]').first().click();
        await page.waitForFunction(() => {
            const panel = document.querySelector('.jpdb-subtitle-list');
            const button = document.querySelector('[data-action="toggle-pause-panel"]');
            return panel instanceof HTMLElement
                && !panel.hidden
                && button?.getAttribute('aria-pressed') === 'true';
        }, null, { timeout: 2000 });
    });
    const closeTiming = await timePageAction(page, async () => {
        await page.evaluate(() => {
            const video = document.querySelector('video');
            Object.defineProperty(video, 'paused', { configurable: true, value: false });
            video.dispatchEvent(new Event('playing'));
        });
        await page.waitForFunction(() => {
            const panel = document.querySelector('.jpdb-subtitle-list');
            return panel instanceof HTMLElement && panel.hidden;
        }, null, { timeout: 3000 });
    });
    const reopenTiming = await timePageAction(page, async () => {
        await page.evaluate(() => {
            const video = document.querySelector('video');
            Object.defineProperty(video, 'paused', { configurable: true, value: true });
            video.dispatchEvent(new Event('pause'));
        });
        await page.waitForFunction(() => {
            const panel = document.querySelector('.jpdb-subtitle-list');
            const button = document.querySelector('[data-action="toggle-pause-panel"]');
            return panel instanceof HTMLElement
                && !panel.hidden
                && button?.getAttribute('aria-pressed') === 'true'
                && document.querySelectorAll('.jpdb-subtitle-list-row').length > 0;
        }, null, { timeout: 3000 });
    });
    const state = await snapshot(page);
    assertLayout(state, 'ipad-pro-portrait', state.placement, 'auto-reopen');
    await page.screenshot({ path: join(outputDir, 'ipad-pro-portrait-auto-reopen.png'), fullPage: false });
    return {
        enableMs: enableTiming.durationMs,
        closeOnPlayMs: closeTiming.durationMs,
        reopenOnPauseMs: reopenTiming.durationMs,
        state: compactSnapshot(state),
    };
}

async function runSwitchSequence(page) {
    const timings = [];
    for (const placement of ['left', 'bottom', 'right']) {
        await resetFixtureInstrumentation(page);
        const timing = await timePageAction(page, async () => {
            await page.locator(`.jpdb-subtitle-panel-placement [data-placement="${placement}"]`).evaluate(button => button.click());
            await page.waitForFunction(expected => {
                return document.querySelector('.jpdb-subtitle-player')?.getAttribute('data-transcript-placement') === expected
                    || document.querySelector('.jpdb-subtitle-list')?.getAttribute('data-transcript-placement') === expected;
            }, placement, { timeout: 5000 }).catch(() => undefined);
            await page.waitForTimeout(120);
        });
        const state = await snapshot(page);
        const assertedPlacement = assertedPlacementForState(placement, state);
        assertLayout(state, 'ipad-pro-portrait', assertedPlacement, `switch-${placement}`);
        await page.screenshot({ path: join(outputDir, `ipad-pro-portrait-switch-${placement}.png`), fullPage: false });
        timings.push({
            placement,
            durationMs: timing.durationMs,
            effectivePlacement: state.placement,
            coercedToBottom: placement !== 'bottom' && state.placement === 'bottom',
        });
    }
    return timings;
}

async function resetFixtureInstrumentation(page) {
    await page.evaluate(() => {
        globalThis.__yomuSetSizeCalls = [];
        globalThis.__yomuResizeEvents = 0;
    });
}

async function installFixtureRoutes(page) {
    await page.route('**/*', route => route.fulfill({ status: 204, body: '' }));
    await page.route('https://www.youtube.com/watch**', route => route.fulfill({ body: youtubeFixtureHtml(), contentType: 'text/html' }));
    await page.route('https://www.youtube.com/api/timedtext**', route => route.fulfill({ body: youtubeTimedText(), contentType: 'text/xml' }));
    await page.route('https://jpdb.io/api/v1/parse', async route => {
        const body = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockJpdbParseFromVocabulary(body, vocabulary)),
        });
    });
}

function bridgeResponse(request) {
    const parsed = new URL(request.url);
    const target = proxiedTargetUrl(parsed) ?? parsed;
    if ((request.method || 'GET').toUpperCase() === 'OPTIONS') {
        return { status: 204, responseText: '', contentType: 'text/plain' };
    }
    if (isYoutubeTimedTextUrl(target)) {
        return { status: 200, responseText: youtubeTimedText(), contentType: 'text/xml; charset=utf-8' };
    }
    if (target.href.startsWith(JPDB_PARSE_URL)) {
        const body = parseJsonBody(gmRequestFetchBody(request));
        return {
            status: 200,
            responseText: JSON.stringify(mockJpdbParseFromVocabulary(body, vocabulary)),
            contentType: 'application/json; charset=utf-8',
        };
    }
    return { status: 204, responseText: '', contentType: 'text/plain' };
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

function smokeSettings(placement) {
    return {
        onboardingSeen: true,
        interfaceLanguage: 'en',
        apiKey: 'fixture-key',
        jitenApiKey: '',
        ankiEnabled: false,
        ankiSectionEnabled: false,
        localDictionariesEnabled: false,
        audioEnabled: false,
        jpdbDefinitionsEnabled: false,
        enableLogging: false,
        showFloatingButton: false,
        subtitlePlayerEnabled: true,
        subtitleAutoDetect: true,
        subtitleOverlayVisible: true,
        subtitleSecondaryVisible: false,
        subtitleTranscriptVisible: false,
        subtitleTranscriptAutoScroll: false,
        subtitleTranscriptPlacement: placement,
        subtitleControlsMode: 'always',
    };
}

async function waitForPanelButton(page) {
    await page.waitForFunction(() => {
        const button = document.querySelector('.jpdb-subtitle-rail [data-action="panel"]');
        return button instanceof HTMLButtonElement && !button.disabled && getComputedStyle(button).display !== 'none';
    }, null, { timeout: 15000 });
}

async function waitForPanelOpen(page) {
    await page.waitForFunction(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        return panel instanceof HTMLElement && !panel.hidden && panel.getBoundingClientRect().width > 260;
    }, null, { timeout: 8000 });
}

async function waitForFullTranscriptRender(page) {
    await page.waitForFunction(() => {
        return document.querySelectorAll('.jpdb-subtitle-list-row').length > 20;
    }, null, { timeout: 4000 }).catch(() => undefined);
}

async function timePageAction(page, action) {
    const started = await page.evaluate(() => performance.now());
    await action();
    const ended = await page.evaluate(() => performance.now());
    return { durationMs: Math.round((ended - started) * 10) / 10 };
}

async function resizeTranscriptPanelByKeyboard(page, placement) {
    const handle = page.locator('[data-resize-transcript]').first();
    const before = await panelSize(page);
    await handle.focus();
    const key = placement === 'bottom' ? 'ArrowDown' : placement === 'left' ? 'ArrowRight' : 'ArrowLeft';
    const repeat = placement === 'bottom' ? 4 : 2;
    for (let index = 0; index < repeat; index += 1) await page.keyboard.press(key);
    await page.waitForFunction(({ width, height }) => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        if (!(panel instanceof HTMLElement)) return false;
        const rect = panel.getBoundingClientRect();
        return Math.abs(rect.width - width) > 20 || Math.abs(rect.height - height) > 20;
    }, before, { timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(120);
}

async function panelSize(page) {
    return page.evaluate(() => {
        const rect = document.querySelector('.jpdb-subtitle-list')?.getBoundingClientRect();
        return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
    });
}

async function snapshot(page) {
    return page.evaluate(() => {
        const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
        const style = selector => {
            const element = document.querySelector(selector);
            if (!(element instanceof HTMLElement)) return null;
            return {
                width: element.style.width,
                maxWidth: element.style.maxWidth,
                minWidth: element.style.minWidth,
                height: element.style.height,
                maxHeight: element.style.maxHeight,
                minHeight: element.style.minHeight,
                marginLeft: element.style.marginLeft,
                marginRight: element.style.marginRight,
            };
        };
        const computed = selector => {
            const element = document.querySelector(selector);
            if (!(element instanceof HTMLElement)) return null;
            const styles = getComputedStyle(element);
            return {
                display: styles.display,
                justifyContent: styles.justifyContent,
                marginLeft: styles.marginLeft,
                marginRight: styles.marginRight,
            };
        };
        return {
            placement: document.querySelector('.jpdb-subtitle-player')?.getAttribute('data-transcript-placement')
                || document.querySelector('.jpdb-subtitle-list')?.getAttribute('data-transcript-placement')
                || '',
            viewport: { width: innerWidth, height: innerHeight },
            panel: rect('.jpdb-subtitle-list'),
            video: rect('#movie_player'),
            primary: rect('#primary'),
            columns: rect('#columns'),
            title: rect('ytd-watch-metadata h1'),
            actions: rect('#actions'),
            description: rect('#description'),
            secondary: rect('#secondary'),
            rowCount: document.querySelectorAll('.jpdb-subtitle-list-row').length,
            panelStyle: style('.jpdb-subtitle-list'),
            primaryStyle: style('#primary'),
            primaryInnerStyle: style('#primary-inner'),
            playerStyle: style('#player'),
            moviePlayerStyle: style('#movie_player'),
            columnsStyle: style('#columns'),
            columnsComputed: computed('#columns'),
            insetClasses: document.documentElement.className,
            insetValue: document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset'),
            setSizeCalls: globalThis.__yomuSetSizeCalls ?? [],
            resizeEvents: globalThis.__yomuResizeEvents ?? 0,
        };
    });
}

function assertLayout(state, viewportName, requestedPlacement, phase) {
    assertBox(state.panel, `${viewportName}/${requestedPlacement}/${phase} panel`);
    assertBox(state.video, `${viewportName}/${requestedPlacement}/${phase} video`);
    const expectedBottom = requestedPlacement === 'bottom' || state.viewport.width < 700;
    if (expectedBottom) {
        assert(state.placement === 'bottom', `expected bottom placement in ${viewportName}/${requestedPlacement}/${phase}`, compactSnapshot(state));
        assert(Math.abs(state.panel.bottom - state.viewport.height) <= 1, `bottom panel has a viewport gap in ${viewportName}/${requestedPlacement}/${phase}`, compactSnapshot(state));
        assertStableYouTubePlayerSizing(state, `${viewportName}/${requestedPlacement}/${phase}`);
        assert((state.title?.width ?? 0) <= state.viewport.width + 1, `title became abnormally wide in ${viewportName}/${requestedPlacement}/${phase}`, compactSnapshot(state));
        assert((state.actions?.width ?? 0) <= state.viewport.width + 1, `actions became abnormally wide in ${viewportName}/${requestedPlacement}/${phase}`, compactSnapshot(state));
        assert((state.description?.width ?? 0) <= state.viewport.width + 1, `description became abnormally wide in ${viewportName}/${requestedPlacement}/${phase}`, compactSnapshot(state));
        return;
    }
    assert(!overlaps(state.panel, state.video), `panel overlaps video in ${viewportName}/${requestedPlacement}/${phase}`, compactSnapshot(state));
    assert(state.placement === requestedPlacement, `unexpected side placement in ${viewportName}/${requestedPlacement}/${phase}`, compactSnapshot(state));
    assertStableYouTubePlayerSizing(state, `${viewportName}/${requestedPlacement}/${phase}`);
    if (requestedPlacement === 'left') {
        assert(Math.abs(state.panel.left) <= 1, `left panel has a viewport gap in ${viewportName}/${phase}`, compactSnapshot(state));
        assert(state.panel.right <= state.video.left + 1, `left panel covers video in ${viewportName}/${phase}`, compactSnapshot(state));
        assert(state.panel.right <= state.title.left + 1, `left panel covers title area in ${viewportName}/${phase}`, compactSnapshot(state));
        assert(sideDockGap(state.panel, state.video, 'left') <= 80, `left video is not docked against the panel in ${viewportName}/${phase}`, compactSnapshot(state));
        assert(sideDockGap(state.panel, state.title, 'left') <= 80, `left title is not docked against the panel in ${viewportName}/${phase}`, compactSnapshot(state));
    } else {
        assert(Math.abs(state.panel.right - state.viewport.width) <= 1, `right panel has a viewport gap in ${viewportName}/${phase}`, compactSnapshot(state));
        assert(state.video.right <= state.panel.left + 1, `right panel covers video in ${viewportName}/${phase}`, compactSnapshot(state));
        assert(state.title.right <= state.panel.left + 1, `right panel covers title area in ${viewportName}/${phase}`, compactSnapshot(state));
        assert(sideDockGap(state.panel, state.video, 'right') <= 80, `right video is not docked against the panel in ${viewportName}/${phase}`, compactSnapshot(state));
    }
}

function compactSnapshot(state) {
    return {
        placement: state.placement,
        viewport: state.viewport,
        panel: roundRect(state.panel),
        video: roundRect(state.video),
        title: roundRect(state.title),
        actions: roundRect(state.actions),
        description: roundRect(state.description),
        rowCount: state.rowCount,
        columnsStyle: state.columnsStyle,
        columnsComputed: state.columnsComputed,
        primaryStyle: state.primaryStyle,
        primaryInnerStyle: state.primaryInnerStyle,
        playerStyle: state.playerStyle,
        moviePlayerStyle: state.moviePlayerStyle,
        insetClasses: state.insetClasses,
        insetValue: state.insetValue,
        setSizeCallCount: state.setSizeCalls.length,
    };
}

function assertBottomResizePreservedPageContent(before, after, label) {
    assert(rectDelta(before.video, after.video) <= 2, `bottom drawer resize moved the video frame in ${label}`, {
        before: compactSnapshot(before),
        after: compactSnapshot(after),
    });
    const requiresFullMetadataReveal = label.includes('ipad');
    if (requiresFullMetadataReveal) {
        assert(after.title?.bottom <= after.panel.top + 1, `bottom drawer resize still covers the video title in ${label}`, compactSnapshot(after));
        assert(after.description?.bottom <= after.panel.top + 1, `bottom drawer resize still covers the video description in ${label}`, compactSnapshot(after));
    } else {
        assert(after.title?.top < after.panel.top, `bottom drawer resize did not reveal the video title in ${label}`, compactSnapshot(after));
        if (!label.includes('desktop')) {
            assert(after.description?.top < after.panel.top, `bottom drawer resize did not reveal the video description in ${label}`, compactSnapshot(after));
        }
    }
}

function rectDelta(a, b) {
    if (!a || !b) return Number.POSITIVE_INFINITY;
    return Math.max(
        Math.abs(a.left - b.left),
        Math.abs(a.top - b.top),
        Math.abs(a.width - b.width),
        Math.abs(a.height - b.height),
    );
}

function assertStableYouTubePlayerSizing(state, label) {
    assert(state.setSizeCalls.length === 0, `stable transcript layout called YouTube setSize in ${label}`, compactSnapshot(state));
    assert(!/jpdb-subtitle-video-inset-(?:left|right|bottom)/.test(state.insetClasses), `stable transcript layout left an inset class in ${label}`, compactSnapshot(state));
    assert(!state.insetValue, `stable transcript layout left an inset variable in ${label}`, compactSnapshot(state));
    for (const [name, style] of [
        ['primary', state.primaryStyle],
        ['primary-inner', state.primaryInnerStyle],
        ['columns', state.columnsStyle],
        ['player', state.playerStyle],
        ['movie_player', state.moviePlayerStyle],
    ]) {
        assert(!style?.width, `stable transcript layout set ${name} width in ${label}`, compactSnapshot(state));
        assert(!style?.maxWidth, `stable transcript layout set ${name} max-width in ${label}`, compactSnapshot(state));
        assert(!style?.height, `stable transcript layout set ${name} height in ${label}`, compactSnapshot(state));
        assert(!style?.maxHeight, `stable transcript layout set ${name} max-height in ${label}`, compactSnapshot(state));
        assert(!style?.minHeight, `stable transcript layout set ${name} min-height in ${label}`, compactSnapshot(state));
        assert(!style?.marginLeft, `stable transcript layout shifted ${name} left margin in ${label}`, compactSnapshot(state));
        assert(!style?.marginRight, `stable transcript layout shifted ${name} right margin in ${label}`, compactSnapshot(state));
    }
}

function assertBox(box, label) {
    assert(Boolean(box && box.width > 80 && box.height > 60), `missing usable ${label}`, { box });
}

function overlaps(a, b) {
    return Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
}

function sideDockGap(panel, target, side) {
    if (!panel || !target) return Number.POSITIVE_INFINITY;
    return side === 'left'
        ? Math.max(0, target.left - panel.right)
        : Math.max(0, panel.left - target.right);
}

function roundRect(rect) {
    if (!rect) return null;
    return Object.fromEntries(['left', 'top', 'right', 'bottom', 'width', 'height'].map(key => [key, Math.round(rect[key])]));
}

function youtubeTimedText() {
    const lines = [
        ['今日は', '日本語', '字幕', 'を', '確認', 'します'],
        ['左側', 'でも', '動画', 'を', '隠しません'],
        ['下側', 'では', '説明', 'と', '操作', 'を', '広げません'],
    ];
    const body = Array.from({ length: 123 }, (_, index) => {
        const words = lines[index % lines.length];
        const start = 1000 + index * 2100;
        const segments = words.map((word, wordIndex) => `<s t="${wordIndex * 280}">${word}</s>`).join('');
        return `<p t="${start}" d="2100">${segments}</p>`;
    }).join('\n');
    return `<timedtext><body>${body}</body></timedtext>`;
}

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
];

function youtubeFixtureHtml() {
    const playerResponse = {
        videoDetails: { videoId: 'p044fixture' },
        captions: {
            playerCaptionsTracklistRenderer: {
                captionTracks: [{
                    baseUrl: 'https://www.youtube.com/api/timedtext?v=p044fixture&lang=ja',
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
  <title>YouTube P0-44 fixture</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; overflow-x: hidden; }
    ytd-watch-flexy { display: block; }
    #columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 360px); gap: 24px; max-width: 1720px; margin: 0 auto; padding: 72px 24px 32px; box-sizing: border-box; align-items: start; }
    #primary, #primary-inner { min-width: 0; box-sizing: border-box; }
    #player, #player-container-outer, #player-container-inner, ytd-player { display: block; min-width: 0; }
    #movie_player { position: relative; width: 100%; aspect-ratio: 16 / 9; min-height: 320px; background: #000; overflow: hidden; }
    #movie_player video { display: block; width: 100%; height: 100%; background: linear-gradient(135deg, #111, #252525); }
    .ytp-caption-window-container { position: absolute; left: 20%; right: 20%; bottom: 64px; text-align: center; font-size: 28px; text-shadow: 0 2px 4px #000; }
    ytd-watch-metadata { display: block; min-width: 0; padding-top: 18px; }
    ytd-watch-metadata h1 { margin: 0 0 14px; font-size: 24px; line-height: 1.28; font-weight: 650; overflow-wrap: anywhere; }
    #actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; min-width: 0; }
    #actions button { border: 0; border-radius: 18px; padding: 8px 14px; color: #f1f1f1; background: #272727; font: inherit; }
    #description { max-width: 100%; box-sizing: border-box; border-radius: 8px; padding: 12px 14px; background: #272727; color: #ddd; line-height: 1.5; overflow-wrap: anywhere; }
    #secondary { display: grid; gap: 14px; min-width: 0; color: #ddd; }
    ytd-compact-video-renderer { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 10px; min-width: 0; }
    .thumb { min-height: 78px; border-radius: 8px; background: #303030; }
    ytd-compact-video-renderer a { color: #f1f1f1; text-decoration: none; line-height: 1.35; }
    @media (max-width: 699px) {
      #columns { display: block; padding: 56px 12px 24px; }
      #secondary { margin-top: 18px; }
      #movie_player { min-height: 210px; }
    }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};
    for (const name of ['ytd-watch-flexy', 'ytd-player', 'ytd-watch-metadata', 'ytd-compact-video-renderer']) {
      if (!customElements.get(name)) customElements.define(name, class extends HTMLElement {});
    }
  </script>
</head>
<body>
  <ytd-watch-flexy video-id="p044fixture">
    <main id="columns">
      <section id="primary">
        <div id="primary-inner">
          <div id="player"><div id="player-container-outer"><div id="player-container-inner"><ytd-player>
            <div id="movie_player">
              <video controls muted playsinline></video>
              <div class="ytp-caption-window-container"><span class="ytp-caption-segment">今日は日本語字幕を確認します</span></div>
            </div>
          </ytd-player></div></div></div>
          <ytd-watch-metadata>
            <h1>日本語タイトルと説明を確認するための動画</h1>
            <div id="actions">
              <button type="button">Like</button><button type="button">Share</button><button type="button">Save</button><button type="button">Clip</button>
            </div>
            <div id="description">これは説明欄です。下側の文字起こしパネルでも横幅が異常に広がらず、ボタンやタイトルと同じ列に収まります。</div>
          </ytd-watch-metadata>
        </div>
      </section>
      <aside id="secondary">
        ${Array.from({ length: 8 }, (_, index) => `<ytd-compact-video-renderer><div class="thumb"></div><a href="/watch?v=${index}">おすすめ動画 ${index + 1} と日本語の説明</a></ytd-compact-video-renderer>`).join('')}
      </aside>
    </main>
  </ytd-watch-flexy>
  <script>
    const player = document.querySelector('#movie_player');
    const video = document.querySelector('video');
    globalThis.__yomuSetSizeCalls = [];
    globalThis.__yomuResizeEvents = 0;
    window.addEventListener('resize', () => { globalThis.__yomuResizeEvents += 1; });
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
