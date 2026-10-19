#!/usr/bin/env node
// W1-46: built product on the redacted Piccoma store recording (real header
// markup and pcm_web_v65 CSS), compared with the same page without Yomu.
// No Piccoma application code or assets are copied into the implementation.
// --product=v2.1.6 proves the regression; --live checks the current store with
// the same probes (page traffic only; product requests remain offline).
import { chromium, webkit } from 'playwright';
import { openRecordedPage, releaseProduct, worktreeProduct } from './lib/recorded-page.mjs';

const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1];
const product = option('product') ? releaseProduct(option('product')) : worktreeProduct();
const live = args.includes('--live');
const engines = (option('engines') ?? 'chromium,webkit').split(',');
const selectors = [
    '.PCM-headerNavMenu > ul > li > a',
    '.PCM-headerRegister a',
    '.PCM-headerLogin a',
    '.bl_shortCutLink_list a',
    '.PCM-slot_title a',
    '.PCM-homeProductSlot_title a',
].join(',');
const failures = [];
const check = (ok, message) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`);
    if (!ok) failures.push(message);
};

for (const engine of engines) {
    const browser = await ({ chromium, webkit })[engine].launch();
    const contextOptions = engine === 'webkit'
        ? { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
        : { viewport: { width: 1280, height: 900 } };
    try {
        const baseline = await measure(browser, null, contextOptions);
        const annotated = await measure(browser, product, contextOptions);
        const prefix = `${product.label} ${engine} ${live ? 'live' : 'recorded'} Piccoma`;
        check(baseline.labels.length >= 10, `${prefix}: real header, quick menu and more links present`);
        check(annotated.words >= 15 && annotated.quickRuns >= 1, `${prefix}: annotated ${annotated.words} words; ${annotated.quickRuns} flex/grid runs exercised`);
        const deltas = annotated.labels.map((label, index) => {
            const before = baseline.labels[index];
            if (!before || before.text !== label.text) return { index, mismatch: true };
            const box = Math.max(...label.box.map((value, axis) => Math.abs(value - before.box[axis])));
            const glyphs = label.glyphs.length === before.glyphs.length
                ? Math.max(0, ...label.glyphs.flatMap((rect, i) => rect.map((value, axis) => Math.abs(value - before.glyphs[i][axis])))) : Infinity;
            return { index, text: label.text, box, glyphs };
        });
        check(annotated.labels.length === baseline.labels.length && deltas.every(delta => !delta.mismatch && delta.box <= 2), `${prefix}: every anchor box within 2 px (${JSON.stringify(deltas.filter(delta => delta.mismatch || delta.box > 2))})`);
        check(deltas.every(delta => delta.glyphs <= 2), `${prefix}: glyph positions/gaps within 2 px (${JSON.stringify(deltas.filter(delta => delta.glyphs > 2))})`);
        check(annotated.activeBorders === 1, `${prefix}: one active-tab border, got ${annotated.activeBorders}`);
        check(annotated.inlineConflicts.length === 0, `${prefix}: no runtime inline box writes on annotation shells ${JSON.stringify(annotated.inlineConflicts)}`);
        console.log(JSON.stringify({ engine, product: product.label, baseline, annotated, deltas }));
    } finally {
        await browser.close();
    }
}
if (failures.length) process.exitCode = 1;

async function measure(browser, selectedProduct, contextOptions) {
    const run = await openRecordedPage({
        browser, slug: 'piccoma-web', product: selectedProduct, contextOptions,
        navigate: false, pageNetwork: live ? 'live' : 'offline',
        // Parsing is offline in both builds: the test judges the boxes of the
        // built local tokenizer, independently of dictionary-service outages.
        gmNetwork: 'offline',
    });
    try {
        if (live) await run.context.unroute('**/*');
        await run.page.goto(run.recording.manifest.url, {
            waitUntil: live ? 'domcontentloaded' : 'load', timeout: 90_000,
        });
        await run.page.evaluate(() => {
            // The recording's active tab is the icon-only Home tab. Exercise a
            // text tab's active state too, using the site's own class and CSS.
            document.querySelector('.PCM-headerNavMenu > ul > li.PCM-stt_active')?.classList.remove('PCM-stt_active');
            document.querySelector('.GTM-NavMenu-women')?.parentElement.classList.add('PCM-stt_active');
        });
        await run.page.waitForTimeout(selectedProduct ? 5_000 : 200);
        const labels = [];
        // Only the first "more" row needs scrolling. Restrict to the first
        // instance of each title class; unrelated book listings stay untouched.
        const targets = run.page.locator(selectors);
        const count = await targets.count();
        let moreCount = 0;
        for (let i = 0; i < count; i++) {
            const target = targets.nth(i);
            const isMore = await target.evaluate(element => Boolean(element.closest('.PCM-slot_title,.PCM-homeProductSlot_title')));
            if (isMore && ++moreCount > 2) continue;
            if (!await target.isVisible()) continue;
            await target.scrollIntoViewIfNeeded();
            if (selectedProduct) await run.page.waitForTimeout(250);
            labels.push(await target.evaluate(labelMetrics));
        }
        return {
            labels,
            ...await run.page.evaluate(() => {
                const shells = [...document.querySelectorAll('.jpdb-reader-word,.jpdb-reader-ruby-base,.jpdb-reader-run')];
                const properties = /^(padding|margin|border)(-|$)|^(float|width|height|min-width|min-height|max-width|max-height|background-image|box-shadow|text-indent)$/u;
                return {
                    words: document.querySelectorAll('.jpdb-reader-word').length,
                    // 2.1.6's wrapper is classless, so count the DOM shape too.
                    quickRuns: document.querySelectorAll('.bl_shortCutLink_list a > span > span:has(> .jpdb-reader-word)').length,
                    activeBorders: [...document.querySelectorAll('.PCM-headerNavMenu > ul > li.PCM-stt_active a span')]
                        .filter(element => parseFloat(getComputedStyle(element).borderBottomWidth) > 0).length,
                    inlineConflicts: shells.flatMap(element => [...element.style].filter(property => properties.test(property)).map(property => `${element.className}: ${property}`)),
                };
            }),
        };
    } finally {
        await run.close();
    }
}

function labelMetrics(element) {
    const box = element.getBoundingClientRect();
    // Compare positions within the authored row as well as size. Scroll offsets
    // differ when each lower link is brought into view; row-local coordinates
    // still catch a preceding label pushing this anchor sideways.
    const row = element.closest('.PCM-headerMainInner,.bl_shortCutLink_list,.PCM-slot_title,.PCM-homeProductSlot_title');
    const origin = row?.getBoundingClientRect() ?? { x: 0, y: 0 };
    const glyphs = [];
    let text = '';
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode: node => node.parentElement.closest('rt,rp,.jpdb-reader-detached-furi') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (let offset = 0; offset < node.length; offset++) {
            if (/\s/u.test(node.data[offset])) continue;
            const range = document.createRange();
            range.setStart(node, offset);
            range.setEnd(node, offset + 1);
            const rect = range.getBoundingClientRect();
            text += node.data[offset];
            glyphs.push([rect.x - box.x, rect.y - box.y, rect.width, rect.height]);
        }
    }
    return { text, box: [box.x - origin.x, box.y - origin.y, box.width, box.height], glyphs };
}
