#!/usr/bin/env node
// Diagnostic probe for the reported m.youtube.com mobile bugs: ruby-inflated
// rows losing their base text and the watch-page description box overlapping
// neighbouring content. Loads a watch page in an iPhone profile, injects the
// built userscript, expands the description, and measures (1) vertical
// rect intersections between adjacent rendered lines and (2) our injected
// surfaces intersecting the description box. Screenshots land in /tmp.
import { chromium, devices } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assertBuiltArtifacts,
    createSmokePaths,
    launchSmokeBrowser,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, root: ROOT } = createSmokePaths(import.meta.dirname);
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT);

const WATCH_URL = process.argv[2] ?? 'https://m.youtube.com/watch?v=f2Q5tPfiSAE';

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    ankiEnabled: false,
    audioEnabled: false,
    enableLogging: false,
    furiganaMode: 'all',
};

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const context = await browser.newContext({
    ...devices['iPhone 13'],
    bypassCSP: true,
    locale: 'ja-JP',
});
// Pre-set consent cookies so the cookie interstitial never mounts.
await context.addCookies([
    { name: 'CONSENT', value: 'YES+cb.20240101-08-p0.ja+FX+667', domain: '.youtube.com', path: '/' },
    { name: 'SOCS', value: 'CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMTA5LjA4X3AwGgJqYSACGgYIgJzqrQY', domain: '.youtube.com', path: '/' },
]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => {
    if (message.type() === 'error' && /yomu|jpdb/i.test(message.text())) errors.push(message.text());
});

try {
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: settings });
    await page.goto(WATCH_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Dismiss the consent sheet when YouTube serves it anyway: expand the
    // "続きを読む" fold first, then accept.
    for (const selector of ['button:has-text("続きを読む")', 'button:has-text("すべてに同意")', 'button:has-text("Accept all")', 'form[action*="consent"] button']) {
        const control = page.locator(selector).first();
        if (await control.count() && await control.isVisible().catch(() => false)) {
            await control.tap().catch(() => control.click().catch(() => undefined));
            await page.waitForTimeout(1500);
        }
    }
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    await page.waitForSelector('video, ytm-watch', { timeout: 20000 }).catch(() => undefined);

    await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForTimeout(8000);

    // Expand the description if the affordance exists.
    const expanders = [
        'ytm-expandable-video-description-body-renderer button',
        '.expand-button',
        'button[aria-label*="description" i]',
        'ytm-description-shelf-renderer button',
    ];
    for (const selector of expanders) {
        const button = page.locator(selector).first();
        if (await button.count() && await button.isVisible().catch(() => false)) {
            await button.tap().catch(() => button.click().catch(() => undefined));
            await page.waitForTimeout(2500);
            break;
        }
    }
    await page.screenshot({ path: '/tmp/myt-watch.png', fullPage: false });

    const report = await page.evaluate(() => {
        const intersects = (a, b) => Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) > 2
            && Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) > 2;

        // 1) Adjacent line overlap inside text blocks that contain our ruby.
        const lineOverlaps = [];
        for (const ruby of document.querySelectorAll('rt.jpdb-reader-furi')) {
            const block = ruby.closest('p, span, div, yt-attributed-string, .yt-core-attributed-string');
            if (!block) continue;
            const range = document.createRange();
            range.selectNodeContents(block);
            const rects = [...range.getClientRects()].filter(rect => rect.height > 4 && rect.width > 4);
            for (let index = 1; index < rects.length; index++) {
                const prev = rects[index - 1];
                const rect = rects[index];
                // Same column, vertically overlapping more than ruby normally would.
                if (rect.top < prev.bottom - 4 && Math.abs(rect.left - prev.left) < rect.width) {
                    lineOverlaps.push({
                        text: (block.textContent ?? '').slice(0, 40),
                        prev: { top: prev.top, bottom: prev.bottom },
                        rect: { top: rect.top, bottom: rect.bottom },
                    });
                    break;
                }
            }
            if (lineOverlaps.length >= 5) break;
        }

        // 2) Our injected fixed surfaces overlapping the description container.
        const description = document.querySelector(
            'ytm-expandable-video-description-body-renderer, ytm-description-shelf-renderer, ytm-video-description-header-renderer',
        );
        const surfaceOverlaps = [];
        if (description) {
            const target = description.getBoundingClientRect();
            for (const surface of document.querySelectorAll('.jpdb-subtitle-player [class*="jpdb-"], .jpdb-reader-fab, .jpdb-youtube-filter-bar')) {
                const rect = surface.getBoundingClientRect();
                if (rect.width < 8 || rect.height < 8) continue;
                if (intersects(rect, target)) {
                    surfaceOverlaps.push({ class: surface.className.toString().slice(0, 60), rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height } });
                }
                if (surfaceOverlaps.length >= 5) break;
            }
        }

        // 3) Ruby-only rows: base text visually missing (zero-height base while rt visible).
        const missingBases = [];
        for (const word of document.querySelectorAll('.jpdb-reader-word.jpdb-reader-has-furi')) {
            const base = word.querySelector('.jpdb-reader-ruby-base, rb') ?? word;
            const rt = word.querySelector('rt');
            if (!rt) continue;
            const baseRect = base.getBoundingClientRect();
            const rtRect = rt.getBoundingClientRect();
            if (rtRect.height > 4 && baseRect.height <= 2) {
                missingBases.push({ text: (word.textContent ?? '').slice(0, 20) });
                if (missingBases.length >= 5) break;
            }
        }

        // 4) Action-chip diagnostics: chips whose label wraps to multiple lines
        // (the stacked 共/有 overlap) with the computed styles that allow it.
        const chipDiagnostics = [];
        for (const word of document.querySelectorAll('.jpdb-reader-word')) {
            const text = (word.textContent ?? '').trim();
            if (!text) continue;
            const rect = word.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(word);
            const lineRects = [...range.getClientRects()].filter(r => r.width > 2 && r.height > 4);
            const chain = [];
            let current = word;
            for (let depth = 0; current && depth < 5; depth++) {
                const style = getComputedStyle(current);
                chain.push({
                    tag: current.tagName.toLowerCase(),
                    class: current.className.toString().slice(0, 60),
                    display: style.display,
                    whiteSpace: style.whiteSpace,
                    width: Math.round(current.getBoundingClientRect().width),
                });
                current = current.parentElement;
            }
            if (lineRects.length > 1) {
                chipDiagnostics.push({ text, lines: lineRects.length, top: Math.round(rect.top), chain });
                if (chipDiagnostics.length >= 4) break;
            }
        }

        return {
            host: location.host,
            hasRuby: Boolean(document.querySelector('rt.jpdb-reader-furi')),
            parsedWords: document.querySelectorAll('.jpdb-reader-word').length,
            parsedWordTexts: [...document.querySelectorAll('.jpdb-reader-word')].map(word => (word.textContent ?? '').trim()).slice(0, 12),
            descriptionFound: Boolean(description),
            lineOverlaps,
            surfaceOverlaps,
            missingBases,
            chipDiagnostics,
        };
    });

    console.log(JSON.stringify({ ...report, errors: errors.slice(0, 3) }, null, 2));
} finally {
    await context.close();
    await browser.close();
}
