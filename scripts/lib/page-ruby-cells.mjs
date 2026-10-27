import * as smokeDependencyBrowsers from 'playwright';
import * as smokeDependencyAozoraMechanismFixtures from './aozora-mechanism-fixtures.mjs';
import * as smokeDependencyJpdbScriptRunParse from './jpdb-script-run-parse.mjs';
import * as smokeDependencyRecordedPage from './recorded-page.mjs';
import * as smokeDependencyAssertions from 'node:assert/strict';
function finishCell(code) { if (code) throw new Error('Merged smoke cell failed with exit code ' + code); }

// Former clamp-row-heal-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertClampRowHeal(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    const _sourceDir = new URL('..', import.meta.url).pathname;
    const { chromium, devices, webkit } = smokeDependencyBrowsers;
    const { AOZORA_SLUG, clampCardsMechanismFixture } = smokeDependencyAozoraMechanismFixtures;
    const { answerJpdbParseByScriptRuns } = smokeDependencyJpdbScriptRunParse;
    const { openRecordedPage, releaseProduct, worktreeProduct } = smokeDependencyRecordedPage;
// Clamped rows heal: the built product, default readings, on
// clamp-cards-mechanism-fixture (lib/aozora-mechanism-fixtures.mjs), the
// recorded Aozora 『吾輩は猫である』 paragraphs as synopsis cards. Card 0's text
// is a 3-line -webkit-line-clamp that opens with kana (どこで生れたか…) and
// holds the author's ruby (見当). No committed recording has a clamped row
// that opens with kana and takes in-flow readings.
//
// WebKit does not grow a -webkit-box clamp for in-flow rt. After the page
// settles, every clamped card must still:
//   - be at least 3 base lines tall,
//   - show at least one base glyph inside its box,
//   - show no reading below the top of the base it annotates.
// Chromium grows the clamp; it runs the same checks.
//
// 2.1.6 measured only the row's first word, which has no reading here, so it
// never healed: in WebKit the card collapsed from 72 to 10 px, readings only.
//
//   node scripts/clamp-row-heal-smoke.mjs
//   node scripts/clamp-row-heal-smoke.mjs --product=v2.1.6     # the failure 2.1.6 shipped with
//   node scripts/clamp-row-heal-smoke.mjs --ipad              # WebKit iPad portrait

const ENGINES = { webkit, chromium };
const SETTLE_MS = 8_000;
const SLOP_PX = 2;
const SETTINGS = { onboardingSeen: true, apiKey: 'clamp-row-heal-smoke', showFloatingButton: false };

const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1];
const viewportArg = option('viewport');
const viewport = viewportArg ? Object.fromEntries(['width', 'height'].map((key, index) => [key, Number(viewportArg.split('x')[index])])) : null;
const engines = (option('engines') ?? 'webkit,chromium').split(',');
const productRef = option('product') ?? 'worktree';
const product = productRef === 'worktree' ? worktreeProduct() : productRef.startsWith('/') ? worktreeProduct(productRef) : releaseProduct(productRef);
const fixture = clampCardsMechanismFixture();
const failures = [];
const check = (condition, message) => {
    console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
    if (!condition) failures.push(message);
};

for (const engine of engines.filter(name => name === _hostEngine)) {
    const browser = _hostBrowser;

        const ipad = args.includes('--ipad') && engine === 'webkit';
        const run = await openRecordedPage({ browser, slug: AOZORA_SLUG, product, settings: SETTINGS, navigate: false, contextOptions: ipad ? { ...devices['iPad Pro 11'], viewport: viewport ?? { width: 820, height: 1180 } } : viewport ? { viewport } : {}, onGmRequest: request => answerJpdbParseByScriptRuns(request) });
        try {
            await run.page.route(run.recording.manifest.url, route => route.fulfill(fixture));
            await run.page.goto(run.recording.manifest.url, { waitUntil: 'load' });
            if (args.includes('--large-text')) await run.page.addStyleTag({ content: '.card{font-size:30px}' });
            await run.page.waitForTimeout(SETTLE_MS);
            // A resize re-runs every post-paint pass; the verdict must hold.
            await run.page.setViewportSize(viewport ?? (ipad ? { width: 800, height: 1180 } : { width: 1260, height: 900 }));
            await run.page.waitForTimeout(2_000);
            const cards = await run.page.evaluate(readClampCards);
            check(run.pageErrors.length === 0, `${product.label} ${engine}: no page errors ${JSON.stringify(run.pageErrors.slice(0, 3))}`);
            check(cards.length >= 3 && cards[0].text.startsWith('どこで'), `${product.label} ${engine}: ${cards.length} clamped cards, the first opening with kana (${cards[0]?.text})`);
            check(cards.some(card => card.annotated), `${product.label} ${engine}: Yomu annotated the clamped cards (${cards.map(card => card.annotated).join(' ')})`);
            for (const card of cards) {
                const label = `${product.label} ${engine} ${card.id} (${card.text})`;
                check(card.height >= 3 * card.lineHeight - SLOP_PX, `${label}: ${card.height} px tall, at least 3 lines of ${card.lineHeight} px [${card.stamp}]`);
                check(card.glyphsInside > 0, `${label}: ${card.glyphsInside} base glyphs inside the row`);
                check(card.readingsBelowBase.length === 0, `${label}: no reading sits below its base ${JSON.stringify(card.readingsBelowBase.slice(0, 3))}`);
            }
        } finally {
            await run.close();
        }

}

if (failures.length) {
    console.error(`\n[clamp-row-heal] ${failures.length} failure(s) on ${product.label}`);
    finishCell(1);
}
console.log(`\n[clamp-row-heal] ${product.label} passed`);

// Runs in the page: each clamped card's geometry, as a reader sees it.
function readClampCards() {
    const visible = rect => rect.width > 0 && rect.height > 0;
    const isReading = node => node.parentElement?.closest('rt, rp, .jpdb-reader-furi');
    return [...document.querySelectorAll('.card p.clamp')].map(row => {
        const rowRect = row.getBoundingClientRect();
        const range = document.createRange();
        let glyphsInside = 0;
        let text = '';
        const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (isReading(node)) continue;
            text += node.data.replace(/\s+/gu, '');
            for (let offset = 0; offset < node.data.length; offset += 1) {
                range.setStart(node, offset);
                range.setEnd(node, offset + 1);
                const rect = range.getBoundingClientRect();
                if (visible(rect) && rect.top >= rowRect.top - 0.5 && rect.bottom <= rowRect.bottom + 0.5) glyphsInside += 1;
            }
        }
        const readingsBelowBase = [...row.querySelectorAll('rt')].flatMap(rt => {
            const rtRect = rt.getBoundingClientRect();
            if (!visible(rtRect) || getComputedStyle(rt).visibility === 'hidden' || rtRect.top >= rowRect.bottom) return [];
            const base = rt.parentElement?.querySelector('.jpdb-reader-ruby-base, rb');
            const baseRect = base?.getBoundingClientRect();
            if (!baseRect || !visible(baseRect)) return [rt.textContent];
            return rtRect.bottom - baseRect.top > 2 ? [`${rt.textContent}: rt ${Math.round(rtRect.top)}-${Math.round(rtRect.bottom)} over base ${Math.round(baseRect.top)}`] : [];
        });
        return {
            id: row.closest('.card')?.id ?? '',
            text: text.slice(0, 12),
            height: Math.round(rowRect.height * 10) / 10,
            lineHeight: parseFloat(getComputedStyle(row).lineHeight),
            stamp: [row.dataset.yomuClipConstrained, row.getAttribute('data-yomu-clamp-growth')].filter(Boolean).join(' '),
            annotated: row.querySelectorAll('.jpdb-reader-word').length,
            glyphsInside,
            readingsBelowBase,
        };
    });
}

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}

// Former page-ruby-lifecycle-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertPageRubyLifecycle(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    const _sourceDir = new URL('..', import.meta.url).pathname;
    const { default: assert } = smokeDependencyAssertions;
    const { devices } = smokeDependencyBrowsers;
    const { answerJpdbParseByScriptRuns } = smokeDependencyJpdbScriptRunParse;
    const { aozoraParagraphsMechanismFixture } = smokeDependencyAozoraMechanismFixtures;
    const { openRecordedPage, worktreeProduct } = smokeDependencyRecordedPage;
// Built userscript + companions on aozora-paragraphs-mechanism-fixture:
// the recorded public-domain text in the paragraph shape that wraps author ruby.
// Trusted puck interactions hide readings, pause annotations, then resume them.
// Clears must retain author ruby nodes; subsequent scans must keep every base,
// reading and fallback punctuation (they may wrap base text in fresh words).

const productPath = process.argv.find(arg => arg.startsWith('--product='))?.split('=')[1];
const product = worktreeProduct(productPath);
const viewportArg = process.argv.find(arg => arg.startsWith('--viewport='))?.split('=')[1];
const viewport = viewportArg ? Object.fromEntries(['width', 'height'].map((key, index) => [key, Number(viewportArg.split('x')[index])])) : null;
const engines = process.argv.find(arg => arg.startsWith('--engines='))?.split('=')[1].split(',') ?? ['chromium', 'webkit'];
for (const engine of engines.filter(name => name === _hostEngine)) {
    const browser = _hostBrowser;

        const run = await openRecordedPage({
            browser, product, slug: 'aozora-wagahai', navigate: false,
            contextOptions: engine === 'webkit' ? { ...devices['iPad Pro 11'], viewport: viewport ?? { width: 820, height: 1180 } } : viewport ? { viewport } : {},
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
            for (const state of ['hidden', 'paused', 'shown']) {
                if (state === 'shown') {
                    // W1-65 restores power directly from the paused puck.
                    await page.keyboard.press('Escape');
                    await activate(page.locator('.jpdb-reader-fab--paused'));
                    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-fab--paused'));
                    await activate(page.locator('.jpdb-reader-fab'));
                    await activate(page.locator('[data-radial-id="furigana"]'));
                } else {
                    const control = page.locator(`[data-radial-id="${state === 'hidden' ? 'furigana' : 'power'}"]`);
                    const previous = await control.getAttribute('aria-label');
                    await activate(control);
                    await page.waitForFunction(({ id, label }) => document.querySelector(`[data-radial-id="${id}"]`)?.getAttribute('aria-label') !== label,
                        { id: state === 'hidden' ? 'furigana' : 'power', label: previous }, { timeout: 30_000 });
                }
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

}

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}
