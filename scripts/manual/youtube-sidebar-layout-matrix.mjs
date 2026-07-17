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
} from '../lib/smoke-harness.mjs';
import { installUserscriptCssResource } from '../lib/smoke-test-helpers.mjs';
import { youtubePlayerResponse, youtubeTimedText, youtubeWatchHtml } from '../fixtures/youtube-fixtures.mjs';

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
const jpdbParseRequests = [];
const placements = ['right', 'left', 'bottom'];
const viewports = [
    { name: 'ipad-pro-portrait', viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { name: 'ipad-pro-landscape', viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { name: 'mobile-iphone-13', ...devices['iPhone 13'] },
    { name: 'desktop-1440', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];
const youtubeTimedTextLines = [
    ['今日は', '日本語', '字幕', 'を', '確認', 'します'],
    ['左側', 'でも', '動画', 'を', '隠しません'],
    ['下側', 'では', '説明', 'と', '操作', 'を', '広げません'],
];
const youtubeTimedTextFixture = youtubeTimedText(Array.from({ length: 123 }, (_, index) => ({
    start: 1000 + index * 2100,
    duration: 2100,
    segments: youtubeTimedTextLines[index % youtubeTimedTextLines.length]
        .map((text, wordIndex) => ({ offset: wordIndex * 280, text })),
})), { surroundingNewlines: false });

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
        const beforeOpen = await snapshot(page);
        assertRailControlParity(beforeOpen, label, 'before-open');
        await page.screenshot({ path: join(outputDir, `${label}-before.png`), fullPage: false });

        const openTiming = await timePageAction(page, async () => {
            await page.locator('.jpdb-subtitle-rail [data-action="panel"]').evaluate(button => button.click());
            await waitForPanelOpen(page);
        });
        const afterOpen = await snapshot(page);
        assertLayout(afterOpen, viewport.name, assertedPlacementForState(placement, afterOpen), 'open');
        assertRailControlParity(afterOpen, label, 'open');
        assertDrawerControlParity(afterOpen, label);
        await page.screenshot({ path: join(outputDir, `${label}-open.png`), fullPage: false });
        await waitForFullTranscriptRender(page);
        const afterFullRender = await snapshot(page);
        assert(afterOpen.rowCount <= 4, `panel open did not use the lightweight preview path in ${label}`, compactSnapshot(afterOpen));
        assert(afterFullRender.rowCount >= 50, `full transcript did not render after the preview in ${label}`, compactSnapshot(afterFullRender));
        assertLayout(afterFullRender, viewport.name, assertedPlacementForState(placement, afterFullRender), 'full-render');
        const subtitleHoverLookup = viewport.name === 'desktop-1440' && placement === 'right'
            ? await runSubtitleHoverLookup(page, label)
            : null;
        const activeCueStability = viewport.name === 'ipad-pro-portrait' && placement === 'right'
            ? await runCurrentLineStabilitySequence(page)
            : null;

        const resizeTiming = await timePageAction(page, async () => {
            await resizeTranscriptPanelByKeyboard(page, afterFullRender.placement);
        });
        const afterResize = await snapshot(page);
        assertLayout(afterResize, viewport.name, assertedPlacementForState(placement, afterResize), 'resize');
        if (placement === 'bottom' || afterResize.placement === 'bottom') assertBottomResizePreservedPageContent(afterFullRender, afterResize, label);
        else assertSideResizeReservedPlayerSpace(afterFullRender, afterResize, label);
        await page.screenshot({ path: join(outputDir, `${label}-resized.png`), fullPage: false });
        const shadowTab = viewport.name === 'desktop-1440' && placement === 'right'
            ? await runShadowTabSequence(page, label)
            : null;

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
            shadowTab,
            switchTiming,
            autoTiming,
            subtitleHoverLookup,
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
        // The auto toggle lives inside the collapsed panel-options popover, so
        // click it directly instead of relying on pointer visibility.
        await page.locator('[data-action="toggle-pause-panel"]').first().evaluate(button => button.click());
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
            await page.locator(`.jpdb-subtitle-panel-options [data-action="transcript-placement"][data-placement="${placement}"]`).evaluate(button => button.click());
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
    await page.route('https://www.youtube.com/watch**', route => route.fulfill({
        body: youtubeWatchHtml({
            fixture: 'sidebar-layout',
            playerResponse: youtubePlayerResponse('p044fixture'),
        }),
        contentType: 'text/html',
    }));
    await page.route('https://www.youtube.com/api/timedtext**', route => route.fulfill({ body: youtubeTimedTextFixture, contentType: 'text/xml' }));
    await page.route('https://jpdb.io/api/v1/parse', async route => {
        const body = JSON.parse(route.request().postData() || '{}');
        const mocked = mockJpdbParseFromVocabulary(body, vocabulary);
        jpdbParseRequests.push({ text: body?.text, tokenCount: mocked.tokens?.flat()?.length ?? 0, via: 'route' });
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mocked),
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
        return { status: 200, responseText: youtubeTimedTextFixture, contentType: 'text/xml; charset=utf-8' };
    }
    if (target.href.startsWith(JPDB_PARSE_URL)) {
        const body = parseJsonBody(gmRequestFetchBody(request));
        const mocked = mockJpdbParseFromVocabulary(body, vocabulary);
        jpdbParseRequests.push({ text: body?.text, tokenCount: mocked.tokens?.flat()?.length ?? 0, via: 'bridge' });
        return {
            status: 200,
            responseText: JSON.stringify(mocked),
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
        apiKey: '',
        jitenApiKey: '',
        ankiEnabled: false,
        ankiSectionEnabled: false,
        localDictionariesEnabled: false,
        showFurigana: false,
        showPitchAccent: false,
        audioEnabled: false,
        jpdbDefinitionsEnabled: false,
        enableLogging: false,
        showFloatingButton: false,
        subtitlePlayerEnabled: true,
        subtitleAutoDetect: true,
        subtitleOverlayVisible: true,
        subtitleSecondaryVisible: false,
        subtitleKaraokeMode: false,
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

async function runSubtitleHoverLookup(page, label) {
    await page.mouse.move(420, 520);
    await page.waitForTimeout(80);
    const firstWord = page.locator('.jpdb-subtitle-primary .jpdb-reader-word').first();
    if (!await firstWord.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
        await page.evaluate(() => {
            const video = document.querySelector('video');
            if (!video) return;
            Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 1.4 });
            video.dispatchEvent(new Event('timeupdate'));
        });
        await firstWord.waitFor({ state: 'visible', timeout: 5000 }).catch(async error => {
            const state = await page.evaluate(() => {
                const primary = document.querySelector('.jpdb-subtitle-primary');
                return {
                    primaryText: primary?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
                    primaryHtml: primary?.innerHTML ?? '',
                    playerClass: document.querySelector('.jpdb-subtitle-player')?.className ?? '',
                    wordCount: document.querySelectorAll('.jpdb-subtitle-primary .jpdb-reader-word').length,
                };
            });
            throw new Error(`${error.message}\n${JSON.stringify({ ...state, jpdbParseRequests: jpdbParseRequests.slice(-8) }, null, 2)}`);
        });
    }
    const timing = await timePageAction(page, async () => {
        await firstWord.hover({ force: true });
        await page.locator('.jpdb-reader-popover .jpdb-reader-spelling').first().waitFor({ state: 'visible', timeout: 1000 });
    });
    const spelling = await page.locator('.jpdb-reader-popover .jpdb-reader-spelling').first().textContent();
    assert(timing.durationMs <= 350, `subtitle hover lookup opened too slowly in ${label}`, { timing, spelling });
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(60);
    return { durationMs: timing.durationMs, spelling: String(spelling ?? '').trim() };
}

async function runShadowTabSequence(page, label) {
    const shadowButton = page.locator('.jpdb-subtitle-list [data-action="panel-shadow"]');
    if (await shadowButton.count() === 0) {
        return { skipped: true, reason: 'shadow panel controls are not present in this build' };
    }
    const timing = await timePageAction(page, async () => {
        await shadowButton.evaluate(button => button.click());
        await page.waitForFunction(() => {
            const panel = document.querySelector('.jpdb-subtitle-list');
            return panel instanceof HTMLElement
                && panel.classList.contains('jpdb-subtitle-shadow-panel')
                && panel.querySelector('[data-action="panel-shadow"]')?.getAttribute('aria-pressed') === 'true'
                && Boolean(panel.querySelector('.jpdb-subtitle-shadow-line'));
        }, null, { timeout: 3000 }).catch(async error => {
            const state = await page.evaluate(() => {
                const panel = document.querySelector('.jpdb-subtitle-list');
                return {
                    panelClass: panel instanceof HTMLElement ? panel.className : '',
                    panelHidden: panel instanceof HTMLElement ? panel.hidden : null,
                    panelText: panel?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 400) ?? '',
                    shadowButton: panel?.querySelector('[data-action="panel-shadow"]')?.outerHTML ?? '',
                    shadowLineCount: panel?.querySelectorAll('.jpdb-subtitle-shadow-line').length ?? 0,
                    rowCount: panel?.querySelectorAll('.jpdb-subtitle-list-row').length ?? 0,
                };
            });
            throw new Error(`${error.message}\n${JSON.stringify(state, null, 2)}`);
        });
    });
    const state = await page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        const line = panel?.querySelector('.jpdb-subtitle-shadow-line');
        return {
            text: line?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            hasReplay: Boolean(panel?.querySelector('[data-action="shadow-replay"]:not([disabled])')),
            hasLoop: Boolean(panel?.querySelector('[data-action="shadow-loop"]:not([disabled])')),
            hasToggle: Boolean(panel?.querySelector('[data-action="shadow-toggle-text"]:not([disabled])')),
        };
    });
    assert(state.text.length > 0, `shadow tab did not show the active cue in ${label}`, state);
    assert(state.hasReplay && state.hasLoop && state.hasToggle, `shadow tab controls were incomplete in ${label}`, state);
    await page.locator('[data-action="shadow-toggle-text"]').first().click();
    await page.waitForFunction(() => {
        const line = document.querySelector('.jpdb-subtitle-shadow-line');
        const toggle = document.querySelector('[data-action="shadow-toggle-text"]');
        return line?.classList.contains('jpdb-subtitle-shadow-line-hidden') && toggle?.getAttribute('aria-pressed') === 'true';
    }, null, { timeout: 1000 });
    await page.screenshot({ path: join(outputDir, `${label}-shadow.png`), fullPage: false });
    return { durationMs: timing.durationMs, text: state.text.slice(0, 40) };
}

async function resizeTranscriptPanelByKeyboard(page, placement) {
    const handle = page.locator('[data-resize-transcript]').first();
    const before = await panelSize(page);
    await handle.focus();
    const key = await resizeKeyThatMovesPanel(page, placement);
    const repeat = placement === 'bottom' ? 4 : 2;
    for (let index = 0; index < repeat; index += 1) await page.keyboard.press(key);
    await page.waitForFunction(({ width, height }) => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        if (!(panel instanceof HTMLElement)) return false;
        const rect = panel.getBoundingClientRect();
        return Math.abs(rect.width - width) > 20 || Math.abs(rect.height - height) > 20;
    }, before, { timeout: 1200 });
    await page.waitForTimeout(120);
}

async function resizeKeyThatMovesPanel(page, placement) {
    const metrics = await page.locator('[data-resize-transcript]').first().evaluate(handle => ({
        max: Number(handle.getAttribute('aria-valuemax')),
        min: Number(handle.getAttribute('aria-valuemin')),
        now: Number(handle.getAttribute('aria-valuenow')),
    }));
    const canGrow = Number.isFinite(metrics.max) && metrics.now < metrics.max - 4;
    const canShrink = Number.isFinite(metrics.min) && metrics.now > metrics.min + 4;
    if (placement === 'bottom') {
        if (canShrink) return 'ArrowDown';
        if (canGrow) return 'ArrowUp';
        throw new Error(`bottom transcript panel cannot be resized: ${JSON.stringify(metrics)}`);
    }
    const growKey = placement === 'left' ? 'ArrowRight' : 'ArrowLeft';
    const shrinkKey = placement === 'left' ? 'ArrowLeft' : 'ArrowRight';
    if (canGrow) return growKey;
    if (canShrink) return shrinkKey;
    throw new Error(`side transcript panel cannot be resized: ${JSON.stringify({ placement, ...metrics })}`);
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
        const buttonData = selector => Array.from(document.querySelectorAll(selector))
            .filter(element => element instanceof HTMLButtonElement)
            .map(button => {
                const styles = getComputedStyle(button);
                const box = button.getBoundingClientRect();
                return {
                    action: button.dataset.action ?? '',
                    disabled: button.disabled,
                    hidden: button.hidden || styles.display === 'none' || styles.visibility === 'hidden' || box.width <= 0 || box.height <= 0,
                    pressed: button.getAttribute('aria-pressed'),
                    rect: box.toJSON(),
                };
            });
        const actionStrip = selector => {
            const element = document.querySelector(selector);
            if (!(element instanceof HTMLElement)) return null;
            const styles = getComputedStyle(element);
            const children = Array.from(element.children)
                .filter(child => child instanceof HTMLElement)
                .map(child => {
                    const box = child.getBoundingClientRect();
                    return { top: Math.round(box.top), height: Math.round(box.height), width: Math.round(box.width) };
                })
                .filter(box => box.width > 0 && box.height > 0);
            const rowTops = [];
            for (const top of children.map(box => box.top).sort((a, b) => a - b)) {
                if (!rowTops.some(rowTop => Math.abs(rowTop - top) <= 8)) rowTops.push(top);
            }
            return {
                rect: element.getBoundingClientRect().toJSON(),
                flexWrap: styles.flexWrap,
                overflowX: styles.overflowX,
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth,
                rows: rowTops.length,
                children,
            };
        };
        return {
            placement: document.querySelector('.jpdb-subtitle-player')?.getAttribute('data-transcript-placement')
                || document.querySelector('.jpdb-subtitle-list')?.getAttribute('data-transcript-placement')
                || '',
            viewport: { width: innerWidth, height: innerHeight },
            panel: rect('.jpdb-subtitle-list'),
            video: rect('#movie_player'),
            videoContainer: rect('#movie_player .html5-video-container'),
            actualVideo: rect('#movie_player video.html5-main-video, #movie_player video'),
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
            videoContainerStyle: style('#movie_player .html5-video-container'),
            actualVideoStyle: style('#movie_player video.html5-main-video, #movie_player video'),
            columnsStyle: style('#columns'),
            columnsComputed: computed('#columns'),
            insetClasses: document.documentElement.className,
            insetValue: document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset'),
            stablePlayerWidth: document.documentElement.style.getPropertyValue('--jpdb-subtitle-youtube-stable-player-width'),
            setSizeCalls: globalThis.__yomuSetSizeCalls ?? [],
            resizeEvents: globalThis.__yomuResizeEvents ?? 0,
            videoPaused: document.querySelector('video')?.paused ?? null,
            railActions: buttonData('.jpdb-subtitle-rail button'),
            drawerActions: buttonData('.jpdb-subtitle-drawer-actions button'),
            drawerActionStrip: actionStrip('.jpdb-subtitle-drawer-actions'),
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
    const expectsTightDock = phase === 'open' || phase === 'full-render';
    if (requestedPlacement === 'left') {
        assert(Math.abs(state.panel.left) <= 1, `left panel has a viewport gap in ${viewportName}/${phase}`, compactSnapshot(state));
        assert(state.panel.right <= state.video.left + 1, `left panel covers video in ${viewportName}/${phase}`, compactSnapshot(state));
        assert(state.panel.right <= state.title.left + 1, `left panel covers title area in ${viewportName}/${phase}`, compactSnapshot(state));
        if (expectsTightDock) {
            assert(sideDockGap(state.panel, state.video, 'left') <= 80, `left video is not docked against the panel in ${viewportName}/${phase}`, compactSnapshot(state));
            assert(sideDockGap(state.panel, state.title, 'left') <= 80, `left title is not docked against the panel in ${viewportName}/${phase}`, compactSnapshot(state));
        }
    } else {
        assert(Math.abs(state.panel.right - state.viewport.width) <= 1, `right panel has a viewport gap in ${viewportName}/${phase}`, compactSnapshot(state));
        assert(state.video.right <= state.panel.left + 1, `right panel covers video in ${viewportName}/${phase}`, compactSnapshot(state));
        assert(state.title.right <= state.panel.left + 1, `right panel covers title area in ${viewportName}/${phase}`, compactSnapshot(state));
        if (expectsTightDock) {
            assert(sideDockGap(state.panel, state.video, 'right') <= 80, `right video is not docked against the panel in ${viewportName}/${phase}`, compactSnapshot(state));
        }
    }
}

function assertRailControlParity(state, label, phase) {
    const allActions = new Set((state.railActions ?? []).map(action => action.action));
    const visibleActions = new Set((state.railActions ?? [])
        .filter(action => !action.hidden)
        .map(action => action.action));
    for (const action of ['panel', 'style']) {
        assert(visibleActions.has(action), `rail is missing ${action} in ${label}/${phase}`, compactSnapshot(state));
    }
    // The rail is transport-free: prev/next/play live only in the drawer head,
    // and fullscreen belongs to the player's own chrome.
    for (const action of ['previous', 'next', 'playback', 'fullscreen', 'panel-tracks']) {
        assert(!allActions.has(action), `rail still renders the removed ${action} control in ${label}/${phase}`, compactSnapshot(state));
    }
}

function assertDrawerControlParity(state, label) {
    const actions = state.drawerActions ?? [];
    const allActions = new Set(actions.map(action => action.action));
    const visibleActions = new Set(actions.filter(action => !action.hidden).map(action => action.action));
    for (const action of ['panel-lines', 'panel-shadow', 'panel-tracks', 'jump-current', 'panel-options', 'transcript-placement', 'toggle-pause-panel', 'close-panel']) {
        assert(allActions.has(action), `drawer is missing ${action} in ${label}`, compactSnapshot(state));
    }
    for (const action of ['panel-lines', 'panel-shadow', 'panel-tracks', 'panel-options']) {
        assert(visibleActions.has(action), `drawer ${action} is not visible in ${label}`, compactSnapshot(state));
    }
    // The drawer transport is the only prev/next/play surface now that the
    // rail is transport-free.
    for (const action of ['previous', 'next', 'playback']) {
        assert(allActions.has(action), `drawer is missing the ${action} transport control in ${label}`, compactSnapshot(state));
    }
    if (state.viewport.width >= 700) return;
    // Narrow drawers wrap the transport cluster onto its own trailing line
    // instead of overflowing the head horizontally.
    assert((state.drawerActionStrip?.scrollWidth ?? 0) <= (state.drawerActionStrip?.clientWidth ?? 0) + 4,
        `mobile drawer actions overflow the first viewport in ${label}`, compactSnapshot(state));
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
        videoContainer: roundRect(state.videoContainer),
        actualVideo: roundRect(state.actualVideo),
        videoContainerStyle: state.videoContainerStyle,
        actualVideoStyle: state.actualVideoStyle,
        insetClasses: state.insetClasses,
        insetValue: state.insetValue,
        stablePlayerWidth: state.stablePlayerWidth,
        setSizeCallCount: state.setSizeCalls.length,
        videoPaused: state.videoPaused,
        railActions: (state.railActions ?? []).map(action => ({ ...action, rect: roundRect(action.rect) })),
        drawerActions: (state.drawerActions ?? []).map(action => ({ ...action, rect: roundRect(action.rect) })),
        drawerActionStrip: state.drawerActionStrip
            ? {
                ...state.drawerActionStrip,
                rect: roundRect(state.drawerActionStrip.rect),
            }
            : null,
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

function assertSideResizeReservedPlayerSpace(before, after, label) {
    assert(after.panel.width > before.panel.width + 20, `side transcript resize did not grow the panel in ${label}`, {
        before: compactSnapshot(before),
        after: compactSnapshot(after),
    });
    assert(after.video.width < before.video.width - 20, `stable YouTube video width did not shrink after panel resize in ${label}`, {
        before: compactSnapshot(before),
        after: compactSnapshot(after),
    });
    assert(after.setSizeCalls.length > before.setSizeCalls.length, `stable resize did not refit the native YouTube player in ${label}`, {
        before: compactSnapshot(before),
        after: compactSnapshot(after),
    });
    const beforeStableWidth = Number.parseFloat(before.stablePlayerWidth || '');
    const afterStableWidth = Number.parseFloat(after.stablePlayerWidth || '');
    assert(Number.isFinite(beforeStableWidth) && Number.isFinite(afterStableWidth) && afterStableWidth < beforeStableWidth - 20,
        `stable player width variable did not shrink after side resize in ${label}`, {
            before: compactSnapshot(before),
            after: compactSnapshot(after),
        });
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
    assert(!/jpdb-subtitle-video-inset-(?:left|right|bottom)/.test(state.insetClasses), `stable transcript layout left an inset class in ${label}`, compactSnapshot(state));
    assert(!state.insetValue, `stable transcript layout left an inset variable in ${label}`, compactSnapshot(state));
    assertVideoContentFitsPlayer(state, label);
    for (const [name, style] of [
        ['primary', state.primaryStyle],
        ['primary-inner', state.primaryInnerStyle],
        ['columns', state.columnsStyle],
        ['player', state.playerStyle],
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

function assertVideoContentFitsPlayer(state, label) {
    if (!/jpdb-subtitle-youtube-stable-side/.test(state.insetClasses)) return;
    for (const [name, box] of [
        ['video container', state.videoContainer],
        ['actual video', state.actualVideo],
    ]) {
        if (!box) continue;
        assert(box.left >= state.video.left - 2, `${name} starts before the stable player in ${label}`, compactSnapshot(state));
        assert(box.right <= state.video.right + 2, `${name} extends past the stable player in ${label}`, compactSnapshot(state));
        assert(box.width <= state.video.width + 2, `${name} stayed wider than the stable player in ${label}`, compactSnapshot(state));
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
