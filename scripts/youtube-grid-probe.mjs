#!/usr/bin/env node
// Desktop probe for the YouTube home-feed filter layout: loads www.youtube.com
// with the built userscript, waits for filtering, then measures the visible
// grid for the regressions reported against 0.6.64-0.6.69 — full-width gap
// bands from emptied rich sections, rows whose first visible item is missing
// the margin-compensation class, and stacked/overlapping cards. Screenshot
// lands in /tmp/yt-home-grid.png.
import { chromium } from 'playwright';
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

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    ankiEnabled: false,
    audioEnabled: false,
    enableLogging: false,
    youtubeImmersionEnabled: true,
};

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const context = await browser.newContext({
    bypassCSP: true,
    locale: 'ja-JP',
    viewport: { width: 1440, height: 900 },
});
await context.addCookies([
    { name: 'CONSENT', value: 'YES+cb.20240101-08-p0.ja+FX+667', domain: '.youtube.com', path: '/' },
    { name: 'SOCS', value: 'CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMTA5LjA4X3AwGgJqYSACGgYIgJzqrQY', domain: '.youtube.com', path: '/' },
]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));

try {
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: settings });
    await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('ytd-rich-grid-renderer', { timeout: 25000 }).catch(() => undefined);
    await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForTimeout(9000);
    await page.screenshot({ path: '/tmp/yt-home-grid.png', fullPage: false });

    const report = await page.evaluate(() => {
        const visible = element => {
            const rect = element.getBoundingClientRect();
            return rect.width > 8 && rect.height > 8;
        };
        const items = [...document.querySelectorAll('ytd-rich-item-renderer')];
        const filtered = items.filter(item => item.classList.contains('jpdb-youtube-filtered'));
        const shown = items.filter(item => !item.classList.contains('jpdb-youtube-filtered') && visible(item));

        // Gap bands: a visible rich section that renders nothing inside.
        const gapBands = [...document.querySelectorAll('ytd-rich-section-renderer')]
            .filter(section => !section.classList.contains('jpdb-youtube-filtered'))
            .filter(section => {
                const rect = section.getBoundingClientRect();
                if (rect.height < 40) return false;
                return ![...section.querySelectorAll('*')].some(child => {
                    const tag = child.tagName.toLowerCase();
                    return (tag.includes('video') || tag.includes('lockup') || tag.includes('shelf'))
                        && !child.classList.contains('jpdb-youtube-filtered')
                        && visible(child);
                });
            })
            .map(section => ({ height: Math.round(section.getBoundingClientRect().height) }));

        // Row sanity: group visible items by rounded top; the leftmost item of
        // each row must carry the first-in-row class once the filter ran.
        const filterActive = document.documentElement.classList.contains('jpdb-youtube-filter-active');
        const rows = new Map();
        for (const item of shown) {
            const rect = item.getBoundingClientRect();
            const key = Math.round(rect.top / 24);
            const row = rows.get(key) ?? [];
            row.push({ item, left: rect.left });
            rows.set(key, row);
        }
        const rowsMissingMarker = [...rows.values()]
            .map(row => row.sort((a, b) => a.left - b.left)[0])
            .filter(first => first && !first.item.classList.contains('jpdb-youtube-first-in-row')).length;

        // Stacked cards: visible items overlapping each other.
        let overlaps = 0;
        const rects = shown.map(item => item.getBoundingClientRect());
        for (let a = 0; a < rects.length && overlaps < 5; a++) {
            for (let b = a + 1; b < rects.length; b++) {
                const xOverlap = Math.min(rects[a].right, rects[b].right) - Math.max(rects[a].left, rects[b].left);
                const yOverlap = Math.min(rects[a].bottom, rects[b].bottom) - Math.max(rects[a].top, rects[b].top);
                if (xOverlap > 24 && yOverlap > 24) { overlaps++; break; }
            }
        }

        return {
            filterActive,
            totalItems: items.length,
            filteredItems: filtered.length,
            shownItems: shown.length,
            gapBands,
            rowsMissingMarker: filterActive ? rowsMissingMarker : 0,
            overlappingCards: overlaps,
        };
    });

    const problems = [];
    if (report.filterActive) {
        if (report.gapBands.length) problems.push(`empty visible sections: ${JSON.stringify(report.gapBands)}`);
        if (report.rowsMissingMarker) problems.push(`${report.rowsMissingMarker} visible rows missing first-in-row marker`);
        if (report.overlappingCards) problems.push(`${report.overlappingCards} overlapping visible cards`);
    }
    console.log(JSON.stringify({ ...report, problems, errors: errors.slice(0, 3) }, null, 2));
    if (problems.length) process.exitCode = 1;
} finally {
    await context.close();
    await browser.close();
}
