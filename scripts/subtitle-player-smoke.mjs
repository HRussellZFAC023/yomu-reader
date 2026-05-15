import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const localUrl = process.env.YOMU_SMOKE_LOCAL_URL ?? 'http://127.0.0.1:5173/yomu-reader/video-player/index.html';
const fixtureVideoUrl = process.env.YOMU_SMOKE_VIDEO_URL ?? 'http://127.0.0.1:8766/tutorial.mp4';
const userscriptPath = resolve(process.env.YOMU_SMOKE_USERSCRIPT ?? 'docs/public/yomu.user.js');
const runYouTube = process.env.YOMU_SMOKE_YOUTUBE === '1';
const youtubeUrl = process.env.YOMU_SMOKE_YOUTUBE_URL ?? 'https://www.youtube.com/watch?v=TAorfFcb8_g&t=4604s';

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

function assert(condition, message, details = {}) {
    if (!condition) {
        const suffix = Object.keys(details).length ? `\n${JSON.stringify(details, null, 2)}` : '';
        throw new Error(`${message}${suffix}`);
    }
}

function overlaps(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function isEffectivelyUnblurred(filter) {
    const blur = filter.match(/blur\(([\d.]+)px\)/);
    return filter === 'none' || (blur && Number(blur[1]) < 0.1);
}

function panelSizeDelta(before, after) {
    if (!before || !after) return 0;
    return Math.max(Math.abs(before.width - after.width), Math.abs(before.height - after.height));
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
        const video = document.querySelector('video')?.getBoundingClientRect();
        return {
            placement: document.querySelector('.jpdb-subtitle-player')?.dataset.transcriptPlacement,
            panel: panel?.toJSON(),
            video: video?.toJSON(),
            viewport: { width: window.innerWidth, height: window.innerHeight },
        };
    });
}

async function resizeDrawer(page, placement) {
    const handle = await page.locator('[data-resize-transcript]').boundingBox();
    assert(handle, 'Expected transcript drawer resize handle');
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    if (placement === 'bottom') {
        await page.mouse.move(x, y - 120, { steps: 6 });
    } else if (placement === 'left') {
        await page.mouse.move(x + 140, y, { steps: 6 });
    } else {
        await page.mouse.move(x - 140, y, { steps: 6 });
    }
    await page.mouse.up();
    await page.waitForTimeout(350);
}

async function ensureUserscript(page) {
    const hasRoot = await page.locator('.jpdb-subtitle-player').count();
    if (!hasRoot) {
        try {
            await page.addScriptTag({ path: userscriptPath });
        } catch (error) {
            const client = await page.context().newCDPSession(page);
            await client.send('Runtime.evaluate', {
                expression: readFileSync(userscriptPath, 'utf8'),
                awaitPromise: false,
                allowUnsafeEvalBlockedByCSP: true,
                replMode: true,
            });
        }
    }
    await page.waitForSelector('.jpdb-subtitle-player', { timeout: 8000 });
}

async function runLocalSmoke(browser) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.goto(localUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.evaluate((src) => {
        const video = document.querySelector('video');
        video.src = src;
        video.muted = true;
        video.controls = true;
        video.style.maxHeight = '70vh';
        video.load();
    }, fixtureVideoUrl);
    await ensureUserscript(page);
    await page.setInputFiles('.jpdb-subtitle-player input[data-file="primary"]', primaryPath);
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-subtitle-list-row').length > 1, null, { timeout: 8000 });
    await page.setInputFiles('.jpdb-subtitle-player input[data-file="secondary"]', secondaryPath);
    await page.evaluate(() => { document.querySelector('video').currentTime = 1.4; });
    await page.waitForTimeout(600);

    const subtitleState = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.jpdb-subtitle-list-row')].map(row => row.textContent?.trim() ?? '');
        const secondary = document.querySelector('.jpdb-subtitle-secondary');
        return {
            rowCount: rows.length,
            containsNativeInRows: rows.some(text => /English native subtitle/i.test(text)),
            karaokeWords: document.querySelectorAll('.jpdb-subtitle-karaoke-word').length,
            secondaryFilter: secondary ? getComputedStyle(secondary).filter : '',
        };
    });
    const initial = { ...subtitleState, ...await readDrawerLayout(page) };

    assert(initial.rowCount >= 3, 'Expected full transcript rows to load', initial);
    assert(!initial.containsNativeInRows, 'Native subtitles should not appear in transcript rows', initial);
    assert(initial.karaokeWords > 0, 'Expected karaoke word spans in the player', initial);
    assert(initial.secondaryFilter.includes('blur'), 'Expected native subtitle blur to default on', initial);
    assertDrawerLayout(initial, 'initial load');

    const box = await page.locator('.jpdb-subtitle-secondary').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(650);
    const hoverFilter = await page.locator('.jpdb-subtitle-secondary').evaluate(element => getComputedStyle(element).filter);
    assert(isEffectivelyUnblurred(hoverFilter), 'Hover should temporarily unblur native subtitles', { hoverFilter });

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const clickedWhileHoveringFilter = await page.locator('.jpdb-subtitle-secondary').evaluate(element => getComputedStyle(element).filter);
    assert(isEffectivelyUnblurred(clickedWhileHoveringFilter), 'Click should keep native subtitles clear while hovered', { clickedWhileHoveringFilter });
    await page.mouse.move(20, 20);
    await page.waitForTimeout(650);
    const clickedFilter = await page.locator('.jpdb-subtitle-secondary').evaluate(element => getComputedStyle(element).filter);
    assert(isEffectivelyUnblurred(clickedFilter), 'Click should persist native subtitle blur off', { clickedFilter });

    await resizeDrawer(page, initial.placement);
    const resized = await readDrawerLayout(page);
    assertDrawerLayout(resized, 'drawer resize');
    assert(panelSizeDelta(initial.panel, resized.panel) >= 24, 'Transcript drawer did not resize', { initial, resized });

    await page.close();
    return { initial, resized };
}

async function runYouTubeSmoke(browser) {
    const page = await browser.newPage({ viewport: { width: 2048, height: 1152 }, locale: 'en-GB' });
    await page.goto(youtubeUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    await ensureUserscript(page);
    await page.waitForTimeout(12000);
    const state = await page.evaluate(() => ({
        status: document.querySelector('.jpdb-subtitle-status')?.textContent ?? '',
        rows: document.querySelectorAll('.jpdb-subtitle-list-row').length,
        tracks: document.querySelectorAll('.jpdb-subtitle-track-row').length,
        text: document.querySelector('.jpdb-subtitle-list')?.textContent?.slice(0, 300) ?? '',
    }));
    await page.close();
    return state;
}

const browser = await chromium.launch({ headless: true });
try {
    const local = await runLocalSmoke(browser);
    const result = { local };
    if (runYouTube) result.youtube = await runYouTubeSmoke(browser);
    console.log(JSON.stringify(result, null, 2));
} finally {
    await browser.close();
}
