#!/usr/bin/env node
// Verify: clicking a subtitle word pauses the video; closing the popover resumes it.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    createSmokePaths,
    launchSmokeBrowser,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const WATCH_URL = process.argv[2] ?? 'https://www.youtube.com/watch?v=f2Q5tPfiSAE';
const REQUEST_BRIDGE_NAME = '__yomuMiningPauseRequest';
const SMOKE_VTT_URL = 'https://yomu.invalid/yomu-mining.vtt';
const SMOKE_VTT = `WEBVTT\n\n00:00:00.000 --> 00:10:00.000\n先生いつもありがとうございました。\n`;

const { root: ROOT, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);
const COMPANION_PATHS = ['yomu-anki.user.js', 'yomu-kanji-study.user.js', 'yomu-settings-surface.user.js', 'yomu-video.user.js']
    .map(name => join(ROOT, 'dist', 'greasyfork', name)).filter(existsSync);
mkdirSync('/tmp/yomu-mining-pause', { recursive: true });

const settings = {
    onboardingSeen: true, interfaceLanguage: 'en', apiKey: '', jitenApiKey: '',
    ankiEnabled: false, audioEnabled: false, enableLogging: false,
    localDictionariesEnabled: false, showFloatingButton: false,
    youtubeImmersionEnabled: true, subtitlePlayerEnabled: true, subtitleAutoDetect: true,
    subtitleOverlayVisible: true, subtitleTranscriptVisible: false, subtitleControlsMode: 'always',
    lookupOnClick: true,
    // subtitleMiningPause intentionally omitted -> exercises the new default (true).
};

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
try {
    const context = await browser.newContext({ viewport: { width: 1365, height: 768 }, bypassCSP: true, locale: 'ja-JP' });
    await context.exposeFunction(REQUEST_BRIDGE_NAME, bridgeRequest);
    await context.addCookies([
        { name: 'CONSENT', value: 'YES+cb.20240101-08-p0.ja+FX+667', domain: '.youtube.com', path: '/' },
        { name: 'SOCS', value: 'CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMTA5LjA4X3AwGgJqYSACGgYIgJzqrQY', domain: '.youtube.com', path: '/' },
    ]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: settings, css: readFileSync(CSS_PATH, 'utf8'), requestBridgeName: REQUEST_BRIDGE_NAME });
    await context.addInitScript({ content: [...COMPANION_PATHS, SCRIPT_PATH].map(p => readFileSync(p, 'utf8')).join('\n;\n') });
    await page.goto(WATCH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (const sel of ['button:has-text("すべてに同意")', 'button:has-text("Accept all")', 'form[action*="consent"] button']) {
        const b = page.locator(sel).first();
        if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(1200); }
    }
    await page.waitForSelector('video', { timeout: 45000 });
    await installUserscriptCssResource(page, CSS_PATH);
    await page.evaluate(url => {
        const v = document.querySelector('video');
        if (v && !v.querySelector('track[data-yomu-mining-track]')) {
            const t = document.createElement('track');
            t.kind = 'subtitles'; t.srclang = 'ja'; t.label = 'JA'; t.src = url; t.dataset.yomuMiningTrack = 'true'; v.append(t);
        }
    }, SMOKE_VTT_URL);
    // Wait for yomu to render parsed words in the subtitle overlay.
    await page.waitForFunction(() => Boolean(document.querySelector('.jpdb-subtitle-lines .jpdb-reader-word')), { timeout: 30000 }).catch(() => {});
    // Start playback (muted) so we can observe a real pause/resume transition.
    await page.evaluate(() => { const v = document.querySelector('video'); if (v) { v.muted = true; return v.play?.().catch(() => {}); } });
    await page.waitForTimeout(800);

    const state = async label => page.evaluate(l => ({
        label: l,
        videoPaused: document.querySelector('video')?.paused ?? null,
        popoverOpen: Boolean(document.querySelector('.jpdb-reader-popover')),
        miningPauseSetting: window.GM_getValue?.('jpdb-popup-reader-settings', {})?.subtitleMiningPause ?? null,
    }), label);

    const playing = await state('after-play');

    // Click a subtitle word -> should pause the video and open the lookup popover.
    const word = page.locator('.jpdb-subtitle-lines .jpdb-reader-word').first();
    await word.click({ timeout: 5000 }).catch(async e => { errors.push('word click failed: ' + e); });
    await page.waitForTimeout(700);
    const afterClick = await state('after-word-click');
    await page.screenshot({ path: '/tmp/yomu-mining-pause/after-click.png' });

    // Close the popover with Escape -> should resume the video.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    const afterClose = await state('after-close');

    console.log(JSON.stringify({
        url: WATCH_URL,
        errors: errors.slice(0, 6),
        defaultMiningPauseSetting: playing.miningPauseSetting,
        steps: { playing, afterClick, afterClose },
        verdict: {
            startedPlaying: playing.videoPaused === false,
            clickPaused: afterClick.videoPaused === true && afterClick.popoverOpen === true,
            closeResumed: afterClose.videoPaused === false && afterClose.popoverOpen === false,
        },
    }, null, 2));
} finally {
    await browser.close();
}

async function bridgeRequest(request) {
    if (request.url === SMOKE_VTT_URL) {
        return { status: 200, responseText: SMOKE_VTT, bytes: [...Buffer.from(SMOKE_VTT)], contentType: 'text/vtt; charset=utf-8' };
    }
    const init = { method: request.method, headers: request.headers };
    if (request.data) init.body = request.data;
    const r = await fetch(request.url, init);
    const buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, responseText: buf.toString('utf8'), bytes: [...buf], contentType: r.headers.get('content-type') ?? '' };
}
