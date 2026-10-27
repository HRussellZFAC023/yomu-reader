#!/usr/bin/env node
// Built userscript + companions on aozora-paragraphs-mechanism-fixture:
// the recorded public-domain text in the paragraph shape that wraps author ruby.
// Trusted puck interactions hide readings, pause annotations, then resume them.
// Clears must retain author ruby nodes; subsequent scans must keep every base,
// reading and fallback punctuation (they may wrap base text in fresh words).
import assert from 'node:assert/strict';
import { chromium, devices, webkit } from 'playwright';
import { answerJpdbParseByScriptRuns } from './lib/jpdb-script-run-parse.mjs';
import { aozoraParagraphsMechanismFixture } from './lib/aozora-mechanism-fixtures.mjs';
import { openRecordedPage } from './lib/recorded-page.mjs';

const engines = process.argv.find(arg => arg.startsWith('--engines='))?.split('=')[1].split(',') ?? ['chromium', 'webkit'];
for (const engine of engines) {
    const browser = await ({ chromium, webkit })[engine].launch();
    try {
        const run = await openRecordedPage({
            browser, slug: 'aozora-wagahai', navigate: false,
            contextOptions: engine === 'webkit' ? { ...devices['iPad Pro 11'], viewport: { width: 820, height: 1180 } } : {},
            settings: { onboardingSeen: true, apiKey: 'page-ruby-lifecycle-smoke', furiganaMode: 'all', wordUnderlineColorSource: 'status', showFloatingButton: true },
            onGmRequest: request => answerJpdbParseByScriptRuns(request),
        });
        try {
            const page = run.page;
            const fixture = aozoraParagraphsMechanismFixture();
            // This paragraph reader mechanism has a device-width viewport,
            // like the mobile novel readers it represents.
            fixture.body = fixture.body.replace('</head>', '<meta name="viewport" content="width=device-width,initial-scale=1"></head>');
            await page.route(run.recording.manifest.url, route => route.fulfill(fixture));
            await page.goto(run.recording.manifest.url, { waitUntil: 'load' });
            await page.waitForFunction(() => document.querySelector('.jpdb-reader-word ruby:not(.jpdb-reader-ruby)'), null, { timeout: 30_000 });
            const before = await page.evaluate(() => {
                window.__pageRubyCensus = () => [...document.querySelectorAll('.main_text ruby:not(.jpdb-reader-ruby)')].map(node => {
                    const base = node.cloneNode(true);
                    base.querySelectorAll('rt,rp').forEach(reading => reading.remove());
                    return JSON.stringify([base.textContent, [...node.querySelectorAll('rt:not(.jpdb-reader-furi),rp')].map(reading => [reading.tagName, reading.textContent])]);
                }).sort();
                window.__discardedPageRuby = [];
                const replaceWith = Element.prototype.replaceWith;
                Element.prototype.replaceWith = function (...nodes) {
                    const ruby = this.matches('.jpdb-reader-word') ? [...this.querySelectorAll('ruby:not(.jpdb-reader-ruby)')] : [];
                    const result = replaceWith.apply(this, nodes);
                    window.__discardedPageRuby.push(...ruby.filter(node => !node.isConnected).map(node => node.outerHTML));
                    return result;
                };
                return { census: window.__pageRubyCensus(), wrapped: document.querySelectorAll('.jpdb-reader-word ruby:not(.jpdb-reader-ruby)').length };
            });
            assert(before.census.length > 200 && before.wrapped > 0, `${engine}: scan must wrap original Aozora ruby`);
            console.log(`PASS ${engine}: ${before.census.length} author ruby, ${before.wrapped} wrapped by the product`);
            const activate = locator => engine === 'webkit' ? locator.tap() : locator.click();
            await activate(page.locator('.jpdb-reader-fab'));
            const power = page.locator('.jpdb-reader-fab-radial.is-open [data-radial-id="power"]');
            for (const state of ['hidden', 'paused', 'shown']) {
                const previous = await power.getAttribute('aria-label');
                await activate(power);
                await page.waitForFunction(label => document.querySelector('[data-radial-id="power"]')?.getAttribute('aria-label') !== label, previous, { timeout: 30_000 });
                if (state !== 'paused') {
                    await page.waitForFunction(() => document.querySelector('.jpdb-reader-word ruby:not(.jpdb-reader-ruby)'), null, { timeout: 30_000 });
                }
                await page.waitForTimeout(750);
                const after = await page.evaluate(() => ({
                    discarded: window.__discardedPageRuby,
                    census: window.__pageRubyCensus(),
                    wrappers: document.querySelectorAll('.main_text .jpdb-reader-word').length,
                    state: document.querySelector('[data-radial-id="power"]')?.getAttribute('aria-label'),
                }));
                assert.deepEqual(after.discarded, [], `${engine} ${state}: clear discarded author ruby`);
                assert.deepEqual(after.census, before.census, `${engine} ${state}: author bases/readings/punctuation changed`);
                if (state === 'paused') assert.equal(after.wrappers, 0, `${engine}: pausing must clear word wrappers`);
                console.log(`PASS ${engine} ${state}: clear retained ruby nodes; all bases/readings/punctuation retained after rescan (${after.state})`);
            }
            assert.deepEqual(run.pageErrors, [], `${engine}: page errors`);
        } finally {
            await run.close();
        }
    } finally {
        await browser.close();
    }
}
