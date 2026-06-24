import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { assert } from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';
import { dragTranscriptResizeHandle, panelSizeDelta } from './lib/subtitle-layout-test-utils.mjs';

const localUrl = process.env.YOMU_SMOKE_LOCAL_URL ?? 'http://127.0.0.1:5173/yomu-reader/video-player/index.html';
const fixtureVideoUrl = process.env.YOMU_SMOKE_VIDEO_URL ?? 'http://127.0.0.1:8766/tutorial.mp4';
const userscriptPath = resolve(process.env.YOMU_SMOKE_USERSCRIPT ?? 'dist/yomu.user.js');
const cssPath = resolve(process.env.YOMU_SMOKE_CSS ?? 'dist/yomu.css');
const defaultCompanionDir = existsSync(resolve('dist/greasyfork')) ? 'dist/greasyfork' : 'docs/public/greasyfork';
const companionPaths = ['yomu-kanji-study.user.js', 'yomu-settings-surface.user.js', 'yomu-video.user.js']
    .map(name => resolve(process.env.YOMU_SMOKE_COMPANION_DIR ?? defaultCompanionDir, name));
const settingsKey = 'jpdb-popup-reader-settings';
const runYouTube = process.env.YOMU_SMOKE_YOUTUBE === '1';
const youtubeUrl = process.env.YOMU_SMOKE_YOUTUBE_URL ?? 'https://www.youtube.com/watch?v=TAorfFcb8_g&t=4604s';
const smokeSettings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    ankiEnabled: false,
    localDictionariesEnabled: false,
    audioEnabled: false,
    enableLogging: false,
    showFloatingButton: false,
    subtitlePlayerEnabled: true,
    subtitleOverlayVisible: true,
    subtitleTranscriptVisible: false,
    subtitleTranscriptAutoScroll: false,
};

const fixtureDir = mkdtempSync(join(tmpdir(), 'yomu-subtitle-smoke-'));
const primaryPath = join(fixtureDir, 'primary.vtt');
const secondaryPath = join(fixtureDir, 'secondary.vtt');

writeFileSync(primaryPath, `WEBVTT

00:00:01.000 --> 00:00:09.000
<00:00:01.000>シスコ<00:00:02.000>って。<00:00:02.800>昨日<00:00:03.400>も<00:00:04.000>なんかね、<00:00:04.900>あの<00:00:05.400>オンライン学習<00:00:06.500>みたいな<00:00:07.200>シスコ<00:00:08.000>って。

00:00:09.000 --> 00:00:13.000
これはとても長い自動生成字幕で句読点がなくても画面からはみ出さないように分割されます
`);

writeFileSync(secondaryPath, `WEBVTT

00:00:01.000 --> 00:00:09.000
This is a very long English native subtitle that should blur below Japanese.
`);

function overlaps(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function secondarySubtitleLooksBlurred(style) {
    return style.className.includes('jpdb-subtitle-secondary-blurred')
        && colorIsTransparent(style.color)
        && colorIsTransparent(style.textFillColor)
        && !style.filter.includes('blur');
}

function secondarySubtitleLooksClear(style) {
    return style.className.includes('jpdb-subtitle-secondary-clear')
        || (!colorIsTransparent(style.color) && !colorIsTransparent(style.textFillColor));
}

function colorIsTransparent(color) {
    return color === 'transparent' || /rgba\([^)]*,\s*0(?:\.0+)?\)/u.test(color);
}

async function readSecondarySubtitleStyle(page) {
    return page.locator('.jpdb-subtitle-secondary').evaluate(element => {
        const style = getComputedStyle(element);
        return {
            className: element.className,
            color: style.color,
            textFillColor: style.getPropertyValue('-webkit-text-fill-color') || style.color,
            textShadow: style.textShadow,
            filter: style.filter,
        };
    });
}

function assertDrawerLayout(layout, label) {
    assert(isUsableBox(layout.panel, 260, 80), `Expected transcript panel during ${label}`, layout);
    assert(isUsableBox(layout.video, 240, 120), `Expected usable video during ${label}`, layout);
    assert(!overlaps(layout.panel, layout.video), `Transcript panel overlapped the video during ${label}`, layout);
    assert(isBoxInsideViewport(layout.panel, layout.viewport), `Transcript panel left the viewport during ${label}`, layout);
}

function isUsableBox(box, minWidth, minHeight) {
    return Boolean(box && box.width >= minWidth && box.height >= minHeight);
}

function isBoxInsideViewport(box, viewport) {
    if (!box) return false;
    return hasViewportBounds(box, viewport);
}

function hasViewportBounds(box, viewport) {
    return box.left >= -1
        && box.top >= -1
        && box.right <= viewport.width + 1
        && box.bottom <= viewport.height + 1;
}

async function readDrawerLayout(page) {
    return page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list')?.getBoundingClientRect();
        const viewport = { width: window.innerWidth, height: window.innerHeight };
        const video = bestVisibleVideoRect(viewport);
        const frame = document.querySelector('[data-yomu-video-frame], .html5-video-player, #movie_player, video')?.getBoundingClientRect();
        return {
            placement: document.querySelector('.jpdb-subtitle-player')?.dataset.transcriptPlacement,
            panel: panel?.toJSON(),
            video,
            frame: frame?.toJSON(),
            frameStyle: inlineStyleSnapshot(document.querySelector('[data-yomu-video-frame], .html5-video-player, #movie_player, video')),
            videoStyle: inlineStyleSnapshot(document.querySelector('video')),
            insetClass: document.documentElement.className,
            insetValue: document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset'),
            viewport,
        };

        function bestVisibleVideoRect(viewport) {
            return [...document.querySelectorAll('video')]
                .map(video => clippedRect(video.getBoundingClientRect(), viewport))
                .filter(rect => rect.width > 0 && rect.height > 0)
                .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] ?? null;
        }

        function clippedRect(rect, viewport) {
            const left = Math.max(0, rect.left);
            const top = Math.max(0, rect.top);
            const right = Math.min(viewport.width, rect.right);
            const bottom = Math.min(viewport.height, rect.bottom);
            return {
                x: left,
                y: top,
                left,
                top,
                right,
                bottom,
                width: Math.max(0, right - left),
                height: Math.max(0, bottom - top),
            };
        }

        function inlineStyleSnapshot(element) {
            if (!element) return null;
            return {
                width: element.style.width,
                maxWidth: element.style.maxWidth,
                minWidth: element.style.minWidth,
                height: element.style.height,
                maxHeight: element.style.maxHeight,
                minHeight: element.style.minHeight,
                marginLeft: element.style.marginLeft,
                marginRight: element.style.marginRight,
                objectFit: element.style.objectFit,
            };
        }
    });
}

async function resizeDrawer(page, placement) {
    await dragTranscriptResizeHandle(page, placement, { assert });
}

async function hoverSecondarySubtitle(page) {
    const box = await page.locator('.jpdb-subtitle-secondary').boundingBox();
    assert(box, 'Expected native subtitle line');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    return box;
}

async function dismissYouTubeConsent(page) {
    for (const button of youtubeConsentButtons(page)) {
        if (await clickYouTubeConsentButton(page, button)) return;
    }
}

function youtubeConsentButtons(page) {
    return [/Reject all/i, /Accept all/i, /I agree/i].flatMap(label => [
        page.locator('button').filter({ hasText: label }).last(),
        page.getByRole('button', { name: label }).first(),
    ]);
}

async function clickYouTubeConsentButton(page, button) {
    if (!await locatorExists(button)) return false;
    try {
        await button.click({ force: true, timeout: 2500 });
        await page.waitForTimeout(1000);
        return true;
    } catch {
        // YouTube renders several consent variants; try the next locator.
        return false;
    }
}

async function locatorExists(locator) {
    try {
        return await locator.count() > 0;
    } catch {
        return false;
    }
}

async function showTranscriptLines(page) {
    await page.waitForFunction(() => document.querySelector('.jpdb-subtitle-player')?.classList.contains('jpdb-subtitle-has-lines'), null, { timeout: 45000 });
    await ensureSubtitlePanelOpen(page);
    for (let attempt = 0; attempt < 6; attempt += 1) {
        await page.locator('.jpdb-subtitle-panel-mode [data-action="panel-lines"]').click({ force: true }).catch(() => undefined);
        await page.waitForTimeout(500);
        if (await page.locator('.jpdb-subtitle-list-row').count()) return;
    }
}

async function ensureSubtitlePanelOpen(page, timeout = 5000) {
    const open = await page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        return Boolean(panel && !panel.hidden);
    });
    if (!open) {
        await page.locator('.jpdb-subtitle-rail [data-action="panel"]').evaluate(button => button.click());
    }
    await page.waitForFunction(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        return Boolean(panel && !panel.hidden);
    }, null, { timeout });
}

async function showSubtitleTracks(page) {
    await ensureSubtitlePanelOpen(page);
    for (let attempt = 0; attempt < 6; attempt += 1) {
        await page.locator('.jpdb-subtitle-panel-mode [data-action="panel-tracks"]').click({ force: true }).catch(() => undefined);
        await page.waitForTimeout(500);
        if (await page.locator('.jpdb-subtitle-track-tools [data-action="load"]').count()) return;
    }
}

async function chooseSubtitleFile(page, action, filePath) {
    await showSubtitleTracks(page);
    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator(`.jpdb-subtitle-track-tools [data-action="${action}"]`).click({ force: true });
    const chooser = await chooserPromise;
    await chooser.setFiles(filePath);
}

async function ensureUserscript(page) {
    const hasRoot = await page.locator('.jpdb-subtitle-player').count();
    if (!hasRoot) {
        const css = await installUserscriptCssResource(page, cssPath);
        await installUserscriptBridge(page, css);
        // The subtitle player ships in the video companion (@require in real
        // installs) — inject companions before the core like a userscript
        // manager would.
        for (const companion of companionPaths) {
            await addScriptTagWithCspFallback(page, companion);
        }
        await addScriptTagWithCspFallback(page, userscriptPath);
    }
    await page.waitForSelector('.jpdb-subtitle-player', { timeout: 8000 });
}

async function installUserscriptBridge(page, css) {
    await page.evaluate(({ css, settings, settingsKey }) => {
        const storage = new Map([[settingsKey, settings]]);
        const readStoredValue = (key, fallback) => {
            if (storage.has(key)) return storage.get(key);
            try {
                const raw = localStorage.getItem(key);
                return raw == null ? fallback : JSON.parse(raw);
            } catch {
                return fallback;
            }
        };
        const writeStoredValue = (key, value) => {
            storage.set(key, value);
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch {
                // Storage may be unavailable for synthetic pages.
            }
        };
        window.GM_getValue = (key, fallback) => readStoredValue(key, fallback);
        window.GM_setValue = (key, value) => { writeStoredValue(key, value); };
        window.GM_deleteValue = key => {
            storage.delete(key);
            try {
                localStorage.removeItem(key);
            } catch {
                // Ignore.
            }
        };
        window.GM_listValues = () => [...storage.keys()];
        window.GM_addStyle = stylesheet => {
            const style = document.createElement('style');
            style.textContent = stylesheet;
            (document.head || document.documentElement).append(style);
            return style;
        };
        window.GM_getResourceText = name => name === 'yomuCss' ? css : '';
        window.GM_registerMenuCommand = () => undefined;
        window.GM_xmlhttpRequest = options => {
            const controller = new AbortController();
            fetch(options.url, {
                method: options.method || 'GET',
                headers: options.headers || {},
                body: options.data,
                signal: controller.signal,
            }).then(async response => {
                const responseText = await response.text();
                options.onload?.({
                    status: response.status,
                    statusText: response.statusText,
                    response,
                    responseText,
                    finalUrl: response.url,
                    responseHeaders: '',
                });
            }).catch(error => options.onerror?.(error));
            return { abort: () => controller.abort() };
        };
        window.GM = {
            getValue: async (key, fallback) => readStoredValue(key, fallback),
            setValue: async (key, value) => { writeStoredValue(key, value); },
            deleteValue: async key => { window.GM_deleteValue(key); },
            listValues: async () => [...storage.keys()],
            addStyle: window.GM_addStyle,
            getResourceText: async name => window.GM_getResourceText(name),
            registerMenuCommand: window.GM_registerMenuCommand,
            xmlHttpRequest: window.GM_xmlhttpRequest,
            xmlhttpRequest: window.GM_xmlhttpRequest,
        };
        window.GM_info = { script: { version: '0.0.0-smoke' }, scriptHandler: 'yomu-smoke' };
        window.unsafeWindow = window;
    }, { css, settings: smokeSettings, settingsKey });
}

async function runLocalSmoke(browser) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', error => {
        console.error('PAGE ERROR:', error);
    });
    await page.goto(localUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
        if (document.querySelector('video')) return;
        document.body.innerHTML = `
            <main style="display:grid;grid-template-columns:minmax(0,1fr)320px;gap:18px;padding:28px;background:#101820;color:#e8edf4;min-height:100vh;box-sizing:border-box;font-family:system-ui,sans-serif">
                <section style="position:relative;background:#050608;border:1px solid #243447">
                    <video controls muted preload="metadata" style="display:block;width:100%;aspect-ratio:16/9;background:#050608"></video>
                </section>
                <aside style="border-left:1px solid #2c3b4e;padding-left:18px;color:#9fb0c3">Local subtitle smoke fixture</aside>
            </main>
        `;
    });
    await page.evaluate((src) => {
        const video = document.querySelector('video');
        document.querySelector('[data-stage]')?.classList.add('has-video');
        video.src = src;
        video.muted = true;
        video.controls = true;
        video.style.maxHeight = '70vh';
        video.load();
    }, fixtureVideoUrl);
    await ensureUserscript(page);
    await chooseSubtitleFile(page, 'load', primaryPath);
    await page.waitForFunction(() => document.querySelector('.jpdb-subtitle-player')?.classList.contains('jpdb-subtitle-has-lines'), null, { timeout: 12000 });
    await showTranscriptLines(page);
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-subtitle-list-row').length > 1, null, { timeout: 20000 });
    await chooseSubtitleFile(page, 'load-secondary', secondaryPath);
    await showTranscriptLines(page);
    await page.evaluate(() => { document.querySelector('video').currentTime = 1.4; });
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-subtitle-row-text .jpdb-reader-word').length > 0, null, { timeout: 10000 });
    await page.waitForTimeout(200);

    const subtitleState = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.jpdb-subtitle-list-row')].map(row => row.textContent?.trim() ?? '');
        const secondary = document.querySelector('.jpdb-subtitle-secondary');
        return {
            rowCount: rows.length,
            containsNativeInRows: rows.some(text => /English native subtitle/i.test(text)),
            karaokeWords: document.querySelectorAll('.jpdb-subtitle-karaoke-word').length,
            parsedPlayerWords: document.querySelectorAll('.jpdb-subtitle-primary .jpdb-reader-word').length,
            parsedRowWords: document.querySelectorAll('.jpdb-subtitle-row-text .jpdb-reader-word').length,
            secondaryStyle: secondary ? secondarySubtitleStyle(secondary) : null,
        };

        function secondarySubtitleStyle(element) {
            const style = getComputedStyle(element);
            return {
                className: element.className,
                color: style.color,
                textFillColor: style.getPropertyValue('-webkit-text-fill-color') || style.color,
                textShadow: style.textShadow,
                filter: style.filter,
            };
        }
    });
    const initial = { ...subtitleState, ...await readDrawerLayout(page) };

    assert(initial.rowCount >= 3, 'Expected full transcript rows to load', initial);
    assert(!initial.containsNativeInRows, 'Native subtitles should not appear in transcript rows', initial);
    assert(initial.karaokeWords > 0 || initial.parsedPlayerWords > 0, 'Expected parsed or karaoke word spans in the player', initial);
    assert(initial.parsedRowWords > 0, 'Expected parsed word spans in the transcript rows', initial);
    assert(secondarySubtitleLooksBlurred(initial.secondaryStyle), 'Expected native subtitle blur to default on without CSS filter', initial);
    assertDrawerLayout(initial, 'initial load');

    await hoverSecondarySubtitle(page);
    await page.waitForTimeout(650);
    await hoverSecondarySubtitle(page);
    await page.waitForFunction(() => {
        const subtitle = document.querySelector('.jpdb-subtitle-secondary');
        if (!subtitle) return false;
        const style = getComputedStyle(subtitle);
        const color = style.color;
        const fill = style.getPropertyValue('-webkit-text-fill-color') || color;
        const transparent = value => value === 'transparent' || /rgba\([^)]*,\s*0(?:\.0+)?\)/u.test(value);
        return !transparent(color) && !transparent(fill);
    }, null, { timeout: 2000 });
    const hoverStyle = await readSecondarySubtitleStyle(page);
    assert(secondarySubtitleLooksClear(hoverStyle), 'Hover should temporarily unblur native subtitles', { hoverStyle });

    await page.locator('.jpdb-subtitle-secondary').click();
    const clickedWhileHoveringStyle = await readSecondarySubtitleStyle(page);
    assert(secondarySubtitleLooksClear(clickedWhileHoveringStyle), 'Click should keep native subtitles clear while hovered', { clickedWhileHoveringStyle });
    await page.mouse.move(20, 20);
    await page.waitForTimeout(650);
    const clickedStyle = await readSecondarySubtitleStyle(page);
    assert(secondarySubtitleLooksClear(clickedStyle), 'Click should persist native subtitle blur off', { clickedStyle });

    await resizeDrawer(page, initial.placement);
    const resized = await readDrawerLayout(page);
    assertDrawerLayout(resized, 'drawer resize');
    assert(panelSizeDelta(initial.panel, resized.panel) >= 24, 'Transcript drawer did not resize', { initial, resized });

    await page.close();
    return { initial, resized };
}

async function runLocalMobileWrapSmoke(browser) {
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
    });
    page.on('pageerror', error => {
        console.error('MOBILE PAGE ERROR:', error);
    });
    await page.goto(localUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
        document.body.innerHTML = `
            <main style="margin:0;background:#050608;color:#e8edf4;min-height:100vh;font-family:system-ui,sans-serif;overflow:hidden">
                <video controls muted preload="metadata" style="display:block;width:100%;aspect-ratio:16/9;background:#050608"></video>
            </main>
        `;
    });
    await page.evaluate((src) => {
        const video = document.querySelector('video');
        video.src = src;
        video.muted = true;
        video.controls = true;
        video.load();
    }, fixtureVideoUrl);
    await ensureUserscript(page);
    await chooseSubtitleFile(page, 'load', primaryPath);
    await page.locator('.jpdb-subtitle-rail [data-action="panel"]').evaluate(button => button.click()).catch(() => undefined);
    await page.waitForFunction(() => document.querySelector('.jpdb-subtitle-list')?.hidden, null, { timeout: 5000 }).catch(() => undefined);
    await page.evaluate(() => {
        const video = document.querySelector('video');
        video.currentTime = 9.4;
    });
    await page.waitForFunction(() => {
        const text = document.querySelector('.jpdb-subtitle-primary')?.textContent ?? '';
        return text.includes('自動生成字幕');
    }, null, { timeout: 10000 });
    await page.waitForTimeout(250);

    const wrap = await readPrimarySubtitleWrap(page);
    assert(wrap.primary.left >= -1, 'Mobile primary subtitle overflowed left edge', wrap);
    assert(wrap.primary.right <= wrap.viewport.width + 1, 'Mobile primary subtitle overflowed right edge', wrap);
    assert(wrap.lineBoxes.length > 1, 'Expected long mobile primary subtitle to wrap onto multiple lines', wrap);
    assert(wrap.style.overflowWrap === 'anywhere', 'Expected primary subtitle emergency wrapping', wrap);
    assert(wrap.style.wordBreak === 'normal', 'Expected primary subtitle to use normal Japanese line breaking', wrap);

    await page.close();
    return wrap;
}

async function readPrimarySubtitleWrap(page) {
    return page.evaluate(() => {
        const primary = document.querySelector('.jpdb-subtitle-primary');
        const style = primary ? getComputedStyle(primary) : null;
        return {
            primary: primary?.getBoundingClientRect().toJSON() ?? null,
            lineBoxes: primary ? [...primary.getClientRects()].map(rect => rect.toJSON()) : [],
            viewport: { width: window.innerWidth, height: window.innerHeight },
            style: {
                overflowWrap: style?.overflowWrap ?? '',
                wordBreak: style?.wordBreak ?? '',
                whiteSpace: style?.whiteSpace ?? '',
            },
            text: primary?.textContent ?? '',
        };
    });
}

async function runYouTubeSmoke(browser) {
    const page = await browser.newPage({ viewport: { width: 2048, height: 1152 }, locale: 'en-GB' });
    await page.goto(youtubeUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    await dismissYouTubeConsent(page);
    await page.waitForTimeout(5000);
    await ensureUserscript(page);
    await waitForYouTubePanelReady(page);
    await ensureSubtitlePanelOpen(page, 10000);
    await showTranscriptLines(page);
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-subtitle-list-row').length > 0, null, { timeout: 45000 });
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-subtitle-row-text .jpdb-reader-word').length > 0, null, { timeout: 45000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    const layout = await readDrawerLayout(page);
    const state = await readYouTubeSmokeState(page);
    assertYouTubeSmokeState(state, layout);
    await page.close();
    return { ...state, layout };
}

function assertYouTubeSmokeState(state, layout) {
    assert(state.rows > 0, 'Expected YouTube transcript rows', state);
    assert(state.parsedRowWords > 0, 'Expected parsed YouTube transcript words', state);
    assert(state.railPanelButton, 'Expected rail panel toggle for closing transcript panel', state);
    assert(state.placementButtons === 3, 'Expected transcript panel dock controls', state);
    assertYouTubeRowFont(state);
    assertDrawerLayout(layout, 'YouTube transcript');
}

function assertYouTubeRowFont(state) {
    const rowFont = state.rowFont || {};
    assert(rowFont.size === '16px', 'Expected YouTube sidebar rows to use popup-scale font size', state);
    assert(rowFontWeight(rowFont) <= 500, 'Expected YouTube sidebar rows to avoid the old bold weight', state);
    assert(rowFont.textShadow === 'none', 'Expected YouTube sidebar rows to match dictionary text without subtitle shadow', state);
}

function rowFontWeight(rowFont) {
    return Number(rowFont.weight ?? 999);
}

async function waitForYouTubePanelReady(page) {
    await page.waitForSelector('.jpdb-subtitle-rail [data-action="panel"]', { timeout: 20000 });
    await page.waitForFunction(() => {
        const status = document.querySelector('.jpdb-subtitle-status')?.textContent ?? '';
        return /track|line|subtitle|detected/i.test(status);
    }, null, { timeout: 30000 }).catch(() => undefined);
}

async function readYouTubeSmokeState(page) {
    return page.evaluate(() => {
        const status = document.querySelector('.jpdb-subtitle-status');
        const row = document.querySelector('.jpdb-subtitle-row-text');
        const list = document.querySelector('.jpdb-subtitle-list');
        return {
            status: elementText(status),
            rows: document.querySelectorAll('.jpdb-subtitle-list-row').length,
            tracks: document.querySelectorAll('.jpdb-subtitle-track-row').length,
            parsedRowWords: document.querySelectorAll('.jpdb-subtitle-row-text .jpdb-reader-word').length,
            parsedPlayerWords: document.querySelectorAll('.jpdb-subtitle-primary .jpdb-reader-word').length,
            railPanelButton: Boolean(document.querySelector('.jpdb-subtitle-rail [data-action="panel"]')),
            placementButtons: document.querySelectorAll('.jpdb-subtitle-list [data-action="transcript-placement"][data-placement]').length,
            rowFont: subtitleRowFont(row),
            text: elementText(list).slice(0, 300),
        };

        function elementText(element) {
            return element?.textContent ?? '';
        }

        function subtitleRowFont(row) {
            if (!row) return null;
            const style = getComputedStyle(row);
            return {
                family: style.fontFamily,
                size: style.fontSize,
                weight: style.fontWeight,
                lineHeight: style.lineHeight,
                textShadow: style.textShadow,
            };
        }
    });
}

const browser = await launchSmokeBrowser({ headless: true });
try {
    const local = await runLocalSmoke(browser);
    const localMobileWrap = await runLocalMobileWrapSmoke(browser);
    const result = { local, localMobileWrap };
    if (runYouTube) result.youtube = await runYouTubeSmoke(browser);
    console.log(JSON.stringify(result, null, 2));
} finally {
    await browser.close();
}

async function launchSmokeBrowser(options) {
    const configuredChannel = process.env.YOMU_PLAYWRIGHT_CHANNEL;
    if (configuredChannel) return launchBrowserChannel(options, configuredChannel);
    return await launchDefaultSmokeBrowser(options);
}

function launchBrowserChannel(options, channel) {
    return chromium.launch({ ...options, channel });
}

async function launchDefaultSmokeBrowser(options) {
    try {
        return await chromium.launch(options);
    } catch (error) {
        return launchChromeFallback(options, error);
    }
}

function launchChromeFallback(options, error) {
    if (!isMissingPlaywrightBrowser(error)) throw error;
    return launchBrowserChannel(options, 'chrome');
}

function isMissingPlaywrightBrowser(error) {
    return String(error?.message ?? '').includes("Executable doesn't exist");
}
