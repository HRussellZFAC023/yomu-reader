#!/usr/bin/env node
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
import { chromium, devices, webkit } from 'playwright';
import { AOZORA_SLUG, clampCardsMechanismFixture } from './lib/aozora-mechanism-fixtures.mjs';
import { answerJpdbParseByScriptRuns } from './lib/jpdb-script-run-parse.mjs';
import { openRecordedPage, releaseProduct, worktreeProduct } from './lib/recorded-page.mjs';

const ENGINES = { webkit, chromium };
const SETTLE_MS = 8_000;
const SLOP_PX = 2;
const SETTINGS = { onboardingSeen: true, apiKey: 'clamp-row-heal-smoke', showFloatingButton: false };

const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1];
const engines = (option('engines') ?? 'webkit,chromium').split(',');
const productRef = option('product') ?? 'worktree';
const product = productRef === 'worktree' ? worktreeProduct() : productRef.startsWith('/') ? worktreeProduct(productRef) : releaseProduct(productRef);
const fixture = clampCardsMechanismFixture();
const failures = [];
const check = (condition, message) => {
    console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
    if (!condition) failures.push(message);
};

for (const engine of engines) {
    const browser = await ENGINES[engine].launch();
    try {
        const ipad = args.includes('--ipad') && engine === 'webkit';
        const run = await openRecordedPage({ browser, slug: AOZORA_SLUG, product, settings: SETTINGS, navigate: false, contextOptions: ipad ? { ...devices['iPad Pro 11'], viewport: { width: 820, height: 1180 } } : {}, onGmRequest: request => answerJpdbParseByScriptRuns(request) });
        try {
            await run.page.route(run.recording.manifest.url, route => route.fulfill(fixture));
            await run.page.goto(run.recording.manifest.url, { waitUntil: 'load' });
            await run.page.waitForTimeout(SETTLE_MS);
            // A resize re-runs every post-paint pass; the verdict must hold.
            await run.page.setViewportSize(ipad ? { width: 800, height: 1180 } : { width: 1260, height: 900 });
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
    } finally {
        await browser.close();
    }
}

if (failures.length) {
    console.error(`\n[clamp-row-heal] ${failures.length} failure(s) on ${product.label}`);
    process.exit(1);
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
