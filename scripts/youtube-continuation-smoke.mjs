#!/usr/bin/env node
// Deterministic native-IntersectionObserver fixture; no video streams or live
// YouTube requests. Exercise the production filter, not a reimplemented guard.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright';
import { assert, newTouchSmokePage } from './lib/smoke-harness.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'artifacts/youtube-continuation');
mkdirSync(output, { recursive: true });
const bundle = await build({
    stdin: {
        contents: `
            import { YoutubeImmersionFilter } from './src/reader/subtitles/youtube';
            import { DEFAULT_SETTINGS } from './src/reader/settings';
            import { installTrustedReaderRootBoundary } from './src/reader/ui/trusted-interaction';
            const settings = { ...DEFAULT_SETTINGS, interfaceLanguage: 'en',
                youtubeImmersionEnabled: true, youtubeShowChannelRecommendations: false };
            const filter = new YoutubeImmersionFilter({ getSettings: () => settings });
            installTrustedReaderRootBoundary(document);
            filter.init();
            Object.assign(window, { stopFilter: () => filter.destroy() });
        `,
        loader: 'ts', resolveDir: root,
    }, bundle: true, format: 'iife', platform: 'browser', write: false, logLevel: 'silent',
});
// Include every shipping Reader rule so root styles cannot silently change
// the resume button's position, visibility or native-observer registration.
const css = readFileSync(resolve(root, 'dist/yomu.css'), 'utf8');
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width">
<style>
body { margin: 0; background: #111; color: #eee; font: 16px/1.4 system-ui; }
ytd-watch-flexy,ytd-watch-next-secondary-results-renderer,ytd-compact-video-renderer { display: block; }
#secondary { width: 360px; margin: 20px; }
ytd-compact-video-renderer { height: 65px; padding: 8px; box-sizing: border-box; }
ytd-continuation-item-renderer { display: block; height: 32px; }
tp-yt-paper-spinner { display: block; width: 24px; height: 24px; border: 2px solid #999; border-right-color: transparent; border-radius: 50%; }
${css}
</style></head><body><ytd-watch-flexy><div id="secondary">
<ytd-watch-next-secondary-results-renderer><div id="contents">
<ytd-compact-video-renderer><a id="video-title" href="/watch?v=japanese">日本語の会話</a></ytd-compact-video-renderer>
<ytd-compact-video-renderer><a id="video-title" href="/watch?v=english">English tech review</a></ytd-compact-video-renderer>
<ytd-continuation-item-renderer><tp-yt-paper-spinner active></tp-yt-paper-spinner></ytd-continuation-item-renderer>
</div></ytd-watch-next-secondary-results-renderer>
<ytd-comments><ytd-continuation-item-renderer id="comments-loader"></ytd-continuation-item-renderer></ytd-comments>
</div></ytd-watch-flexy></body></html>`;

const results = [];
for (const [name, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await browserType.launch({ headless: true });
    try {
        const { page, errors } = await newTouchSmokePage(browser, { width:1024, height:768 });
        await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: fixture }));
        await page.goto('https://www.youtube.com/watch?v=fixture');
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.evaluate(() => {
            let requests = 0;
            const contents = document.querySelector('#contents');
            const seen = new WeakSet();
            const pager = new IntersectionObserver(entries => {
                for (const entry of entries) {
                    if (!entry.isIntersecting || seen.has(entry.target) || requests >= 20) continue;
                    seen.add(entry.target);
                    requests += 1;
                    // Retain the served marker, as the reported watch lists do.
                    setTimeout(() => {
                        for (let i = 0; i < 2; i += 1) {
                            const card = document.createElement('ytd-compact-video-renderer');
                            card.innerHTML = '<a id="video-title" href="/watch?v=english' + requests + i + '">English recommendation</a>';
                            contents.append(card);
                        }
                        // Hydration can mount the sentinel in a separate task
                        // after the cards; that mutation must reach the guard.
                        setTimeout(() => {
                            const marker = document.createElement('ytd-continuation-item-renderer');
                            marker.innerHTML = '<tp-yt-paper-spinner active></tp-yt-paper-spinner>';
                            contents.append(marker);
                            pager.observe(marker);
                        }, 0);
                    }, 5);
                }
            });
            pager.observe(contents.querySelector('ytd-continuation-item-renderer'));
            Object.assign(window, { nativeRequests: () => requests, stopPager: () => pager.disconnect() });
        });
        await page.locator('.jpdb-youtube-load-more').waitFor();
        await page.waitForTimeout(400);
        const read = () => page.evaluate(() => ({
            requests: window.nativeRequests(), scrollY,
            visibleSpinners: [...document.querySelectorAll('#contents tp-yt-paper-spinner')].filter(e => {
                const r = e.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
            }).length,
            buttons: document.querySelectorAll('.jpdb-youtube-load-more').length,
            japaneseVisible: document.querySelector('#video-title').getBoundingClientRect().height > 0,
            commentsClass: document.querySelector('#comments-loader').className,
        }));
        const initial = await read();
        assert(initial.requests === 2, 'Fast native paging was not bounded to two automatic batches', initial);
        assert(initial.visibleSpinners === 0 && initial.buttons === 1, 'Served loaders remained visible', initial);
        assert(initial.scrollY === 0 && initial.japaneseVisible && initial.commentsClass === '', 'Filtering altered native content/scroll', initial);
        await page.locator('.jpdb-youtube-load-more').tap();
        await page.waitForFunction(() => window.nativeRequests() >= 4);
        await page.waitForTimeout(400);
        const resumed = await read();
        assert(resumed.requests === 4 && resumed.buttons === 1 && resumed.visibleSpinners === 0, 'Trusted touch did not resume one bounded native batch', resumed);
        await page.screenshot({ path: resolve(output, name + '-fixture.png') });
        await page.evaluate(() => { window.stopPager(); window.stopFilter(); });
        const restored = await page.evaluate(() => ({
            parked: document.querySelectorAll('.jpdb-youtube-continuation-paused,.jpdb-youtube-continuation-stale,.jpdb-youtube-load-more').length,
            nativeMarkers: document.querySelectorAll('#contents ytd-continuation-item-renderer').length,
        }));
        assert(restored.parked === 0 && restored.nativeMarkers === 5, 'Teardown failed to restore native loaders', restored);
        assert(errors.length === 0, 'Browser errors occurred', { errors });
        const stalled = await browser.newPage({ viewport: { width: 1024, height: 768 } });
        await stalled.route('**/*', route => route.fulfill({ contentType: 'text/html', body: fixture }));
        await stalled.goto('https://www.youtube.com/watch?v=stalled');
        await stalled.addScriptTag({ content: bundle.outputFiles[0].text });
        await stalled.locator('.jpdb-youtube-load-more').waitFor({ timeout: 11000 });
        const deadline = await stalled.evaluate(() => ({
            buttons: document.querySelectorAll('.jpdb-youtube-load-more').length,
            paused: document.querySelectorAll('#contents .jpdb-youtube-continuation-paused').length,
            nativeCards: document.querySelectorAll('ytd-compact-video-renderer').length,
            scrollY,
        }));
        assert(deadline.buttons === 1 && deadline.paused === 1 && deadline.nativeCards === 2 && deadline.scrollY === 0,
            'A never-finishing visible loader did not settle without altering native content', deadline);
        await stalled.evaluate(() => window.stopFilter());
        results.push({ browser: name, initial, resumed, restored, deadline });
    } finally { await browser.close(); }
}
writeFileSync(resolve(output, 'evidence.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
